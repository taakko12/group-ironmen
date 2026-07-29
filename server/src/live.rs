use crate::auth_middleware::Authenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{GroupMember, LivePush};
use actix_web::{get, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::Pool;
use futures_util::stream::{self, StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;

fn format_sse_event(kind: &str, members: &[&GroupMember]) -> Option<web::Bytes> {
    if members.is_empty() {
        return None;
    }
    let json = serde_json::json!({ "kind": kind, "members": members });
    let body = serde_json::to_string(&json).ok()?;
    Some(web::Bytes::from(format!("data: {}\n\n", body)))
}

fn event_for_push(push: &LivePush, group_id: i64) -> Option<web::Bytes> {
    let (kind, members) = match push {
        LivePush::Full(members) => ("full", members),
        LivePush::Delta(members) => ("delta", members),
    };
    let filtered: Vec<&GroupMember> = members
        .iter()
        .filter(|m| m.group_id == Some(group_id))
        .collect();
    format_sse_event(kind, &filtered)
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
    db_pool: web::Data<Pool>,
    live_tx: web::Data<broadcast::Sender<Arc<LivePush>>>,
) -> Result<HttpResponse, Error> {
    let group_id = auth.group_id;

    let rx = live_tx.subscribe();

    let initial = {
        let client = db_pool.get().await.map_err(ApiError::PoolError)?;
        let epoch = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
        db::get_group_data(&client, group_id, &epoch, Some(&epoch)).await?
    };
    let initial_refs: Vec<&GroupMember> = initial.iter().collect();
    let initial_event =
        format_sse_event("full", &initial_refs).unwrap_or_else(|| web::Bytes::from_static(b": ping\n\n"));

    let initial_stream = stream::once(async move { Ok::<_, Error>(initial_event) });

    let live_stream = stream::unfold(rx, move |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(push) => {
                    if let Some(event) = event_for_push(&push, group_id) {
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
