use crate::auth_middleware::Authenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    AmIInGroupRequest, GroupDeathData, GroupLootData, GroupMember, GroupSkillData,
    GroupStorageLog, MustBankItem, NameChange, NewDeath, NewLootDrop, NewStorageLogEntry,
    PendingBankPing, RenameGroupMember, RequestBank, SetMemberDiscordId, WomPlayerGains,
    SHARED_MEMBER,
};
use crate::validators::{valid_name, validate_member_prop_length};
use crate::wom;
use actix_web::{delete, get, post, put, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use std::collections::HashMap;
use tokio::sync::mpsc;

#[post("/add-group-member")]
pub async fn add_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
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
    Ok(HttpResponse::Created().finish())
}

#[delete("/delete-group-member")]
pub async fn delete_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Ok().finish())
}

#[put("/rename-group-member")]
pub async fn rename_group_member(
    auth: Authenticated,
    rename_member: web::Json<RenameGroupMember>,
    db_pool: web::Data<Pool>,
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

    validate_member_prop_length("stats", &group_member_inner.stats, 7, 7)?;
    validate_member_prop_length("coordinates", &group_member_inner.coordinates, 3, 4)?;
    validate_member_prop_length("skills", &group_member_inner.skills, 23, 24)?;
    validate_member_prop_length("quests", &group_member_inner.quests, 0, 220)?;
    validate_member_prop_length("inventory", &group_member_inner.inventory, 56, 56)?;
    validate_member_prop_length("equipment", &group_member_inner.equipment, 28, 28)?;
    validate_member_prop_length("bank", &group_member_inner.bank, 0, 3000)?;
    validate_member_prop_length("shared_bank", &group_member_inner.shared_bank, 0, 1000)?;
    validate_member_prop_length("rune_pouch", &group_member_inner.rune_pouch, 6, 8)?;
    validate_member_prop_length("seed_vault", &group_member_inner.seed_vault, 0, 500)?;
    validate_member_prop_length("deposited", &group_member_inner.deposited, 0, 200)?;
    validate_member_prop_length("diary_vars", &group_member_inner.diary_vars, 0, 62)?;
    validate_member_prop_length(
        "collection_log_v2",
        &group_member_inner.collection_log_v2,
        0,
        4000,
    )?;

    match sender.send(group_member_inner).await {
        Ok(_) => Ok(HttpResponse::Ok().finish()),
        Err(_) => Ok(HttpResponse::InternalServerError().body("Failed to submit player update")),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetGroupDataQuery {
    pub from_time: DateTime<Utc>,
}
#[get("/get-group-data")]
pub async fn get_group_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetGroupDataQuery>,
) -> Result<web::Json<Vec<GroupMember>>, Error> {
    let from_time = query.from_time;
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let group_members = db::get_group_data(&client, auth.group_id, &from_time).await?;
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

#[post("/poll-bank-pings")]
pub async fn poll_bank_pings(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<Vec<PendingBankPing>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let pings = db::poll_bank_pings(&client, auth.group_id).await?;
    Ok(web::Json(pings))
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
