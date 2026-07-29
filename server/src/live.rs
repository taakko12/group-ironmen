use crate::auth_middleware::{authenticate_token, AuthenticationCache};
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

#[derive(Deserialize)]
pub struct LiveQuery {
    pub token: String,
}

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
/// Registered outside the AuthenticateMiddleware-wrapped scope (see
/// main.rs) since EventSource can't set an Authorization header -- the
/// token comes in as a query param and is checked directly here instead.
#[get("/api/group/{group_name}/live")]
pub async fn live(
    path: web::Path<String>,
    query: web::Query<LiveQuery>,
    db_pool: web::Data<Pool>,
    auth_cache: web::Data<Arc<AuthenticationCache>>,
    live_tx: web::Data<broadcast::Sender<Arc<LivePush>>>,
) -> Result<HttpResponse, Error> {
    let group_name = path.into_inner();
    let group_id = authenticate_token(&db_pool, &auth_cache, &group_name, &query.token).await?;

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
