use crate::auth_middleware::Authenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{GroupMember, LivePush};
use actix_web::{get, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::Pool;
use futures_util::stream::{self, StreamExt};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::broadcast;

// bank/potion_storage are only ever rendered by the /items page, same as
// get-group-data's include_heavy -- default false so the common case (any
// other page, or a reconnect while on another page) doesn't pull every
// member's full bank on every connect. The frontend reconnects with
// heavy=true when the items page becomes active (see api.js's
// route-activated subscription).
#[derive(Deserialize)]
pub struct LiveQuery {
    #[serde(default)]
    pub heavy: bool,
}

fn format_sse_event(kind: &str, members: &[&GroupMember]) -> Option<web::Bytes> {
    if members.is_empty() {
        return None;
    }
    let json = serde_json::json!({ "kind": kind, "members": members });
    let body = serde_json::to_string(&json).ok()?;
    Some(web::Bytes::from(format!("data: {}\n\n", body)))
}

// Same heavy-gating as the initial snapshot (see LiveQuery doc comment), but
// applied to the ongoing delta stream too: a bank/potion_storage change from
// any member gets broadcast to every connection for that group, so a
// non-items-page tab left open would otherwise keep receiving full bank
// blobs for the lifetime of the connection regardless of the `heavy` param
// it connected with.
//
// collection_log_v2 is stripped unconditionally (not gated behind `heavy`)
// -- it's fetched on demand by the collection-log dialog instead (see
// db::get_collection_log_for_group), so it never needs to ride along here.
fn event_for_push(push: &LivePush, group_id: i64, heavy: bool) -> Option<web::Bytes> {
    let (kind, members) = match push {
        LivePush::Full(members) => ("full", members),
        LivePush::Delta(members) => ("delta", members),
    };
    let filtered: Vec<GroupMember> = members
        .iter()
        .filter(|m| m.group_id == Some(group_id))
        .cloned()
        .map(|mut m| {
            if !heavy {
                m.bank = None;
                m.potion_storage = None;
            }
            m.collection_log_v2 = None;
            m
        })
        .collect();
    let refs: Vec<&GroupMember> = filtered.iter().collect();
    format_sse_event(kind, &refs)
}

/// Replaces the old poll-every-N-seconds get-group-data loop: the browser
/// holds one long-lived connection per group and the server pushes a
/// snapshot on connect, then only the rows update_batcher actually just
/// wrote (see update_batcher.rs). DB reads now scale with real game
/// activity instead of poll-interval x open-tab-count, which is what was
/// driving Supabase egress far past the free tier.
///
/// Auth works the same as every other route in authed_scope (see main.rs) --
/// AuthenticateMiddleware falls back to a `token` query param when the
/// Authorization header is absent, since EventSource can't set custom
/// headers.
#[get("/live")]
pub async fn live(
    auth: Authenticated,
    query: web::Query<LiveQuery>,
    db_pool: web::Data<Pool>,
    live_tx: web::Data<broadcast::Sender<Arc<LivePush>>>,
) -> Result<HttpResponse, Error> {
    let group_id = auth.group_id;

    let rx = live_tx.subscribe();

    let initial = {
        let client = db_pool.get().await.map_err(ApiError::PoolError)?;
        let epoch = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
        let heavy_cutoff = query.heavy.then_some(epoch);
        db::get_group_data(&client, group_id, &epoch, heavy_cutoff.as_ref()).await?
    };
    let initial_refs: Vec<&GroupMember> = initial.iter().collect();
    let initial_event =
        format_sse_event("full", &initial_refs).unwrap_or_else(|| web::Bytes::from_static(b": ping\n\n"));

    let initial_stream = stream::once(async move { Ok::<_, Error>(initial_event) });

    let heavy = query.heavy;
    let live_stream = stream::unfold(rx, move |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(push) => {
                    if let Some(event) = event_for_push(&push, group_id, heavy) {
                        return Some((Ok::<_, Error>(event), rx));
                    }
                    // Nothing relevant to this group in this push; keep waiting.
                }
                // A slow subscriber can fall behind the broadcast channel's
                // ring buffer; skip past the gap rather than erroring out --
                // the next real update still arrives, just without the ones
                // that were dropped in between.
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .append_header(("Cache-Control", "no-cache"))
        .append_header(("X-Accel-Buffering", "no"))
        .append_header(("Content-Encoding", "identity"))
        .streaming(initial_stream.chain(live_stream)))
}
