use crate::auth_middleware::Authenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    AddGoal, AmIInGroupRequest, GoalId, GroupBankPingData, GroupDeathData, GroupGoals,
    GroupLootData, GroupMember, GroupSkillData, GroupStorageLog, LivePush, MustBankItem,
    NameChange, NewDeath, NewLootDrop, NewStorageLogEntry, PendingBankPing, RecentBankPings,
    RenameGroupMember, RequestBank, RequestBankBatch, SetBankPingsEnabled, SetGoalDone,
    SetMemberColor, SetMemberDiscordId, StaleAttachments, UpdateAttachmentUrls, WomPlayerGains,
    SHARED_MEMBER,
};
use crate::validators::{valid_hex_color, valid_name, validate_member_prop_length, ArrayFormat};
use crate::wom;
use actix_web::{delete, get, post, put, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc};

/// Best-effort push of a fresh full roster to any connected /live subscribers
/// after an add/delete/rename -- those are rare admin actions, not something
/// that needs to be fast, so a failure here just means subscribers pick up
/// the change on their next reconnect instead of immediately.
async fn broadcast_full_snapshot(db_pool: &Pool, live_tx: &broadcast::Sender<Arc<LivePush>>, group_id: i64) {
    let Ok(client) = db_pool.get().await else {
        return;
    };
    let epoch = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
    if let Ok(members) = db::get_group_data(&client, group_id, &epoch, Some(&epoch)).await {
        let _ = live_tx.send(Arc::new(LivePush::Full(members)));
    }
}

#[post("/add-group-member")]
pub async fn add_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
    live_tx: web::Data<broadcast::Sender<Arc<LivePush>>>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&group_member.name) {
        return Ok(HttpResponse::BadRequest()
            .body(format!("Member name {} is not valid", group_member.name)));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_group_member(&client, auth.group_id, &group_member.name).await?;
    broadcast_full_snapshot(&db_pool, &live_tx, auth.group_id).await;
    Ok(HttpResponse::Created().finish())
}

#[delete("/delete-group-member")]
pub async fn delete_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
    live_tx: web::Data<broadcast::Sender<Arc<LivePush>>>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, auth.group_id, &group_member.name).await?;
    broadcast_full_snapshot(&db_pool, &live_tx, auth.group_id).await;
    Ok(HttpResponse::Ok().finish())
}

#[put("/rename-group-member")]
pub async fn rename_group_member(
    auth: Authenticated,
    rename_member: web::Json<RenameGroupMember>,
    db_pool: web::Data<Pool>,
    live_tx: web::Data<broadcast::Sender<Arc<LivePush>>>,
) -> Result<HttpResponse, Error> {
    if rename_member.original_name.eq(SHARED_MEMBER) || rename_member.new_name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&rename_member.new_name) {
        return Ok(HttpResponse::BadRequest().body(format!(
            "Member name {} is not valid",
            rename_member.new_name
        )));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::rename_group_member(
        &client,
        auth.group_id,
        &rename_member.original_name,
        &rename_member.new_name,
    )
    .await?;
    broadcast_full_snapshot(&db_pool, &live_tx, auth.group_id).await;
    Ok(HttpResponse::Ok().finish())
}

#[post("/update-group-member")]
pub async fn update_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    sender: web::Data<mpsc::Sender<GroupMember>>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut group_member_inner: GroupMember = group_member.into_inner();
    group_member_inner.group_id = Some(auth.group_id);

    validate_member_prop_length("stats", &group_member_inner.stats, 7, 7, ArrayFormat::Flat)?;
    validate_member_prop_length(
        "coordinates",
        &group_member_inner.coordinates,
        3,
        4,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "skills",
        &group_member_inner.skills,
        23,
        24,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "quests",
        &group_member_inner.quests,
        0,
        250,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "inventory",
        &group_member_inner.inventory,
        56,
        56,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "equipment",
        &group_member_inner.equipment,
        28,
        28,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "bank",
        &group_member_inner.bank,
        0,
        3000,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "shared_bank",
        &group_member_inner.shared_bank,
        0,
        1000,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "rune_pouch",
        &group_member_inner.rune_pouch,
        6,
        8,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "seed_vault",
        &group_member_inner.seed_vault,
        0,
        500,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "deposited",
        &group_member_inner.deposited,
        0,
        200,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "diary_vars",
        &group_member_inner.diary_vars,
        0,
        62,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "collection_log_v2",
        &group_member_inner.collection_log_v2,
        0,
        4000,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "potion_storage",
        &group_member_inner.potion_storage,
        0,
        400,
        ArrayFormat::ItemPairs,
    )?;

    match sender.send(group_member_inner).await {
        Ok(_) => Ok(HttpResponse::Ok().finish()),
        Err(_) => Ok(HttpResponse::InternalServerError().body("Failed to submit player update")),
    }
}

fn default_include_heavy() -> bool {
    true
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetGroupDataQuery {
    pub from_time: DateTime<Utc>,
    // bank/potion_storage are large, unbounded blobs only rendered by the
    // group items page -- callers that don't care about them (or don't know
    // about this param, e.g. the bot's backendClient) can skip fetching them
    // entirely by passing include_heavy=false. Defaults to true so existing
    // callers keep getting everything, unchanged.
    #[serde(default = "default_include_heavy")]
    pub include_heavy: bool,
    // Independent cursor for the heavy fields, so a client that just flipped
    // include_heavy on (e.g. opened the items page) can request the full
    // current bank/potion_storage rather than only what changed since its
    // (much more frequently advancing) light `from_time` cursor.
    pub heavy_from_time: Option<DateTime<Utc>>,
}
#[get("/get-group-data")]
pub async fn get_group_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetGroupDataQuery>,
) -> Result<web::Json<Vec<GroupMember>>, Error> {
    let from_time = query.from_time;
    let heavy_cutoff = query
        .include_heavy
        .then(|| query.heavy_from_time.unwrap_or(from_time));
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let group_members =
        db::get_group_data(&client, auth.group_id, &from_time, heavy_cutoff.as_ref()).await?;
    Ok(web::Json(group_members))
}

#[derive(Deserialize)]
pub enum SkillDataPeriod {
    Day,
    Week,
    Month,
    Year,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetSkillDataQuery {
    pub period: SkillDataPeriod,
}
#[get("/get-skill-data")]
pub async fn get_skill_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetSkillDataQuery>,
) -> Result<web::Json<GroupSkillData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let aggregate_period = match query.period {
        SkillDataPeriod::Day => db::AggregatePeriod::Day,
        SkillDataPeriod::Week => db::AggregatePeriod::Week,
        SkillDataPeriod::Month => db::AggregatePeriod::Month,
        SkillDataPeriod::Year => db::AggregatePeriod::Year,
    };
    let group_skill_data =
        db::get_skills_for_period(&client, auth.group_id, aggregate_period).await?;
    Ok(web::Json(group_skill_data))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetWomGainsQuery {
    pub period: SkillDataPeriod,
}
#[get("/wom-gains")]
pub async fn get_wom_gains(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetWomGainsQuery>,
) -> Result<web::Json<HashMap<String, WomPlayerGains>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let member_names = db::get_group_member_names(&client, auth.group_id).await?;

    let period = match query.period {
        SkillDataPeriod::Day => "day",
        SkillDataPeriod::Week => "week",
        SkillDataPeriod::Month => "month",
        SkillDataPeriod::Year => "year",
    };
    let cache = wom::get_cached_wom_gains(period);
    let mut result = HashMap::new();
    for member_name in member_names {
        if let Some(gains) = cache.get(&member_name) {
            result.insert(member_name, gains.clone());
        }
    }

    Ok(web::Json(result))
}

#[get("/wom-boss-kc")]
pub async fn get_wom_boss_kc(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<HashMap<String, HashMap<String, i64>>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let member_names = db::get_group_member_names(&client, auth.group_id).await?;

    let cache = wom::get_cached_wom_boss_kc();
    let mut result = HashMap::new();
    for member_name in member_names {
        if let Some(kc) = cache.get(&member_name) {
            result.insert(member_name, kc.clone());
        }
    }

    Ok(web::Json(result))
}

#[post("/name-changes")]
pub async fn add_name_change(
    auth: Authenticated,
    body: web::Json<NameChange>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::record_name_change(&client, auth.group_id, &body.old_name, &body.new_name).await?;
    Ok(HttpResponse::Created().finish())
}

#[post("/loot-drop")]
pub async fn add_loot_drop(
    auth: Authenticated,
    loot_drop: web::Json<NewLootDrop>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_loot_drop(&client, auth.group_id, &loot_drop.into_inner()).await?;
    Ok(HttpResponse::Created().finish())
}

#[get("/get-loot-data")]
pub async fn get_loot_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<GroupLootData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let loot_data = db::get_loot_data(&client, auth.group_id).await?;
    Ok(web::Json(loot_data))
}

#[post("/death")]
pub async fn add_death(
    auth: Authenticated,
    death: web::Json<NewDeath>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_death(&client, auth.group_id, &death.into_inner()).await?;
    Ok(HttpResponse::Created().finish())
}

#[get("/get-death-data")]
pub async fn get_death_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<GroupDeathData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let death_data = db::get_death_data(&client, auth.group_id).await?;
    Ok(web::Json(death_data))
}

#[get("/attachment-urls")]
pub async fn get_attachment_urls(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<StaleAttachments>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let result = db::get_attachment_urls(&client, auth.group_id).await?;
    Ok(web::Json(result))
}

#[put("/attachment-urls")]
pub async fn update_attachment_urls(
    auth: Authenticated,
    body: web::Json<UpdateAttachmentUrls>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::update_attachment_urls(&client, auth.group_id, &body.updates).await?;
    Ok(HttpResponse::Ok().finish())
}

#[post("/storage-log")]
pub async fn add_storage_log_entry(
    auth: Authenticated,
    entry: web::Json<NewStorageLogEntry>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_storage_log_entry(&client, auth.group_id, &entry.into_inner()).await?;
    Ok(HttpResponse::Created().finish())
}

#[get("/get-storage-log")]
pub async fn get_storage_log(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<GroupStorageLog>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let storage_log = db::get_storage_log(&client, auth.group_id).await?;
    Ok(web::Json(storage_log))
}

#[put("/member-discord-id")]
pub async fn set_member_discord_id(
    auth: Authenticated,
    body: web::Json<SetMemberDiscordId>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::set_member_discord_id(
        &client,
        auth.group_id,
        &body.member_name,
        body.discord_id.as_deref(),
    )
    .await?;
    Ok(HttpResponse::Ok().finish())
}

#[put("/member-color")]
pub async fn set_member_color(
    auth: Authenticated,
    body: web::Json<SetMemberColor>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if let Some(color) = &body.color {
        if !valid_hex_color(color) {
            return Ok(HttpResponse::BadRequest().body("color must be a hex value like #a1b2c3"));
        }
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::set_member_color(&client, auth.group_id, &body.member_name, body.color.as_deref()).await?;
    Ok(HttpResponse::Ok().finish())
}

#[post("/must-bank-items")]
pub async fn add_must_bank_item(
    auth: Authenticated,
    body: web::Json<MustBankItem>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_must_bank_item(&client, auth.group_id, body.item_id).await?;
    Ok(HttpResponse::Created().finish())
}

#[delete("/must-bank-items")]
pub async fn remove_must_bank_item(
    auth: Authenticated,
    body: web::Json<MustBankItem>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::remove_must_bank_item(&client, auth.group_id, body.item_id).await?;
    Ok(HttpResponse::Ok().finish())
}

#[get("/must-bank-items")]
pub async fn get_must_bank_items(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<Vec<i32>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let items = db::get_must_bank_items(&client, auth.group_id).await?;
    Ok(web::Json(items))
}

#[get("/bank-pings-enabled")]
pub async fn get_bank_pings_enabled(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<bool>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let enabled = db::get_bank_pings_enabled(&client, auth.group_id).await?;
    Ok(web::Json(enabled))
}

#[put("/bank-pings-enabled")]
pub async fn set_bank_pings_enabled(
    auth: Authenticated,
    body: web::Json<SetBankPingsEnabled>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::set_bank_pings_enabled(&client, auth.group_id, body.enabled).await?;
    Ok(HttpResponse::Ok().finish())
}

#[get("/goals")]
pub async fn get_goals(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<GroupGoals>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let goals = db::get_goals(&client, auth.group_id).await?;
    Ok(web::Json(goals))
}

#[post("/goals")]
pub async fn add_goal(
    auth: Authenticated,
    body: web::Json<AddGoal>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let description = body.description.trim();
    if description.is_empty() || description.len() > 200 {
        return Ok(HttpResponse::BadRequest().body("description must be 1-200 characters"));
    }
    if body.added_by.trim().is_empty() {
        return Ok(HttpResponse::BadRequest().body("added_by is required"));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_goal(&client, auth.group_id, description, &body.added_by).await?;
    Ok(HttpResponse::Created().finish())
}

#[put("/goal-done")]
pub async fn set_goal_done(
    auth: Authenticated,
    body: web::Json<SetGoalDone>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::set_goal_done(&client, auth.group_id, body.id, body.done).await?;
    Ok(HttpResponse::Ok().finish())
}

#[delete("/goals")]
pub async fn delete_goal(
    auth: Authenticated,
    body: web::Json<GoalId>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_goal(&client, auth.group_id, body.id).await?;
    Ok(HttpResponse::Ok().finish())
}

#[post("/request-bank")]
pub async fn request_bank(
    auth: Authenticated,
    body: web::Json<RequestBank>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_manual_bank_ping(&client, auth.group_id, &body.member_name, body.item_id).await?;
    Ok(HttpResponse::Created().finish())
}

#[post("/request-bank-batch")]
pub async fn request_bank_batch(
    auth: Authenticated,
    body: web::Json<RequestBankBatch>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_manual_bank_pings_batch(&client, auth.group_id, &body.requests).await?;
    Ok(HttpResponse::Created().finish())
}

#[post("/poll-bank-pings")]
pub async fn poll_bank_pings(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<Vec<PendingBankPing>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let pings = db::poll_bank_pings(&client, auth.group_id).await?;
    Ok(web::Json(pings))
}

#[get("/recent-bank-pings")]
pub async fn get_recent_bank_pings(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<RecentBankPings>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let pings = db::get_recent_bank_pings(&client, auth.group_id).await?;
    Ok(web::Json(pings))
}

#[get("/get-bank-ping-data")]
pub async fn get_bank_ping_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<GroupBankPingData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let bank_ping_data = db::get_bank_ping_data(&client, auth.group_id).await?;
    Ok(web::Json(bank_ping_data))
}

#[get("/am-i-logged-in")]
pub async fn am_i_logged_in(_auth: Authenticated) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().finish())
}

#[get("/am-i-in-group")]
pub async fn am_i_in_group(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    q: web::Query<AmIInGroupRequest>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &q.member_name).await?;

    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Player is not a member of this group"));
    }
    Ok(HttpResponse::Ok().finish())
}

#[get("/collection-log")]
pub async fn get_collection_log() -> Result<web::Json<HashMap<String, Vec<i32>>>, Error> {
    Ok(web::Json(HashMap::new()))
}
