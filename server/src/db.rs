use crate::crypto::token_hash;
use crate::error::ApiError;
use crate::models::{
    AggregateSkillData, CreateGroup, DeathEntry, GroupDeathData, GroupLootData, GroupMember,
    GroupSkillData, LootDropEntry, MemberDeathData, MemberLootData, MemberSkillData, NewDeath,
    NewLootDrop, PendingBankPing, SHARED_MEMBER,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::{HashMap, HashSet};
use tokio_postgres::Row;

const CURRENT_GROUP_VERSION: i32 = 2;
pub async fn create_group(client: &mut Client, create_group: &CreateGroup) -> Result<(), ApiError> {
    let create_group_stmt = client.prepare_cached("INSERT INTO groupironman.groups (group_name, group_token_hash, version) VALUES($1, $2, $3) RETURNING group_id").await?;
    let create_member_stmt = client
        .prepare_cached("INSERT INTO groupironman.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    let transaction = client.transaction().await?;

    let hashed_token = token_hash(&create_group.token, &create_group.name);
    let group_id: i64 = transaction
        .query_one(
            &create_group_stmt,
            &[&create_group.name, &hashed_token, &CURRENT_GROUP_VERSION],
        )
        .await?
        .try_get(0)
        .map_err(ApiError::GroupCreationError)?;

    transaction
        .execute(&create_member_stmt, &[&group_id, &SHARED_MEMBER])
        .await
        .map_err(ApiError::GroupCreationError)?;
    for member_name in &create_group.member_names {
        transaction
            .execute(&create_member_stmt, &[&group_id, &member_name])
            .await
            .map_err(ApiError::GroupCreationError)?;
    }

    transaction
        .commit()
        .await
        .map_err(ApiError::GroupCreationError)
}

pub async fn add_group_member(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let member_count_stmt = client
        .prepare_cached(
            "SELECT COUNT(*) FROM groupironman.members WHERE group_id=$1 AND member_name!=$2",
        )
        .await?;
    let member_count: i64 = client
        .query_one(&member_count_stmt, &[&group_id, &SHARED_MEMBER])
        .await?
        .try_get(0)
        .map_err(ApiError::AddMemberError)?;

    if member_count >= 5 {
        return Err(ApiError::GroupFullError);
    }

    let create_member_stmt = client
        .prepare_cached("INSERT INTO groupironman.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    client
        .execute(&create_member_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::AddMemberError)?;
    Ok(())
}

pub async fn delete_skills_data_for_member(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    member_id: i64,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM groupironman.skills_{} WHERE member_id=$1
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Week => "week",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let delete_skills_data_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_skills_data_stmt, &[&member_id])
        .await?;

    Ok(())
}

pub async fn delete_collection_log_data_for_member(
    transaction: &Transaction<'_>,
    member_id: i64,
) -> Result<(), ApiError> {
    let a = "DELETE FROM groupironman.collection_log WHERE member_id=$1";
    let delete_collection_stmt = transaction.prepare_cached(a).await?;
    transaction
        .execute(&delete_collection_stmt, &[&member_id])
        .await?;

    let b = "DELETE FROM groupironman.collection_log_new WHERE member_id=$1";
    let delete_new_stmt = transaction.prepare_cached(b).await?;
    transaction.execute(&delete_new_stmt, &[&member_id]).await?;

    Ok(())
}

pub async fn get_member_id(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<i64, ApiError> {
    let get_member_id_stmt = client
        .prepare_cached(
            "SELECT member_id FROM groupironman.members WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let member_id: i64 = client
        .query_one(&get_member_id_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?
        .try_get(0)?;
    Ok(member_id)
}

/// Like `get_member_id`, but returns `Ok(None)` instead of an error when no
/// such member exists, so callers (e.g. the bot posting loot/deaths for a
/// name that doesn't exactly match a registered member) can surface a clear
/// validation error instead of a generic 500.
async fn try_get_member_id(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<Option<i64>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_id FROM groupironman.members WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let row = client.query_opt(&stmt, &[&group_id, &member_name]).await?;
    match row {
        Some(row) => Ok(Some(row.try_get(0)?)),
        None => Ok(None),
    }
}

pub async fn delete_group_member(
    client: &mut Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let member_id = get_member_id(client, group_id, member_name).await?;
    let transaction = client.transaction().await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Day, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Week, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Month, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Year, member_id).await?;
    delete_collection_log_data_for_member(&transaction, member_id).await?;

    let stmt = transaction
        .prepare_cached("DELETE FROM groupironman.members WHERE group_id=$1 AND member_name=$2")
        .await?;
    transaction
        .execute(&stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?;

    transaction
        .commit()
        .await
        .map_err(ApiError::DeleteGroupMemberError)?;

    Ok(())
}

pub async fn rename_group_member(
    client: &Client,
    group_id: i64,
    original_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET member_name=$1 WHERE group_id=$2 AND member_name=$3",
        )
        .await?;
    client
        .execute(&stmt, &[&new_name, &group_id, &original_name])
        .await
        .map_err(ApiError::RenameGroupMemberError)?;
    record_name_change(client, group_id, original_name, new_name).await?;
    Ok(())
}

/// Records that `old_name` now goes by `new_name`, so historical Discord
/// messages (e.g. from `/scrape`) referencing the old RSN still resolve to
/// the right member. Called automatically by `rename_group_member`; also
/// exposed directly via `/name-changes` for backfilling renames that
/// happened before this tracking existed.
pub async fn record_name_change(
    client: &Client,
    group_id: i64,
    old_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO groupironman.name_changes (group_id, old_name, new_name)
VALUES ($1, $2, $3)
ON CONFLICT (group_id, old_name) DO UPDATE SET new_name=excluded.new_name
"#,
        )
        .await?;
    client.execute(&stmt, &[&group_id, &old_name, &new_name]).await?;
    Ok(())
}

/// Follows the name_changes chain (old -> new -> newer -> ...) to resolve a
/// possibly-stale name to whatever it's currently known as, capped to avoid
/// looping forever on bad data.
async fn resolve_member_name(client: &Client, group_id: i64, name: &str) -> Result<String, ApiError> {
    let stmt = client
        .prepare_cached("SELECT new_name FROM groupironman.name_changes WHERE group_id=$1 AND old_name=$2")
        .await?;

    let mut current = name.to_string();
    for _ in 0..10 {
        let row = client.query_opt(&stmt, &[&group_id, &current]).await?;
        match row {
            Some(row) => {
                let next: String = row.try_get(0)?;
                if next == current {
                    break;
                }
                current = next;
            }
            None => break,
        }
    }
    Ok(current)
}

pub async fn is_member_in_group(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<bool, ApiError> {
    let stmt = client.prepare_cached("SELECT COUNT(member_name) FROM groupironman.members WHERE group_id=$1 AND member_name=$2").await?;
    let member_count: i64 = client
        .query_one(&stmt, &[&group_id, &member_name])
        .await?
        .try_get(0)
        .map_err(ApiError::IsMemberInGroupError)?;
    Ok(member_count > 0)
}

pub fn serialize_serde<T>(value: &Option<T>) -> Result<Option<String>, ApiError>
where
    T: Serialize,
{
    match value {
        Some(v) => {
            let result = serde_json::to_string(&v)?;
            Ok(Some(result))
        }
        None => Ok(None),
    }
}

pub async fn get_group(client: &Client, group_name: &str, token: &str) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT group_id FROM groupironman.groups WHERE group_token_hash=$1 AND group_name=$2",
        )
        .await?;
    let hashed_token = token_hash(token, group_name);
    let group: Row = client
        .query_one(&stmt, &[&hashed_token, &group_name])
        .await
        .map_err(ApiError::GetGroupError)?;
    Ok(group.try_get(0)?)
}

fn try_deserialize_json_column<T>(row: &Row, column: &str) -> Result<Option<T>, ApiError>
where
    T: DeserializeOwned,
{
    match row.try_get(column) {
        Ok(column_data) => Ok(serde_json::from_str(column_data).ok()),
        Err(_) => Ok(None),
    }
}

pub async fn get_group_data(
    client: &Client,
    group_id: i64,
    timestamp: &DateTime<Utc>,
) -> Result<Vec<GroupMember>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name, discord_id,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update, seed_vault_last_update, diary_vars_last_update,
collection_log_last_update) as last_updated,
CASE WHEN stats_last_update >= $1::TIMESTAMPTZ THEN stats ELSE NULL END as stats,
CASE WHEN coordinates_last_update >= $1::TIMESTAMPTZ THEN coordinates ELSE NULL END as coordinates,
CASE WHEN skills_last_update >= $1::TIMESTAMPTZ THEN skills ELSE NULL END as skills,
CASE WHEN quests_last_update >= $1::TIMESTAMPTZ THEN quests ELSE NULL END as quests,
CASE WHEN inventory_last_update >= $1::TIMESTAMPTZ THEN inventory ELSE NULL END as inventory,
CASE WHEN equipment_last_update >= $1::TIMESTAMPTZ THEN equipment ELSE NULL END as equipment,
CASE WHEN bank_last_update >= $1::TIMESTAMPTZ THEN bank ELSE NULL END as bank,
CASE WHEN rune_pouch_last_update >= $1::TIMESTAMPTZ THEN rune_pouch ELSE NULL END as rune_pouch,
CASE WHEN interacting_last_update >= $1::TIMESTAMPTZ THEN interacting ELSE NULL END as interacting,
CASE WHEN seed_vault_last_update >= $1::TIMESTAMPTZ THEN seed_vault ELSE NULL END as seed_vault,
CASE WHEN diary_vars_last_update >= $1::TIMESTAMPTZ THEN diary_vars ELSE NULL END as diary_vars,
CASE WHEN collection_log_last_update > $1::TIMESTAMPTZ THEN collection_log ELSE NULL END as collection_log
FROM groupironman.members WHERE group_id=$2
"#,
        )
        .await?;

    let rows = client
        .query(&stmt, &[&timestamp, &group_id])
        .await
        .map_err(ApiError::GetGroupDataError)?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let member_name = row.try_get("member_name")?;
        let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated").ok();
        let group_member = GroupMember {
            group_id: Some(group_id),
            name: member_name,
            last_updated,
            discord_id: row.try_get("discord_id").ok(),
            stats: row.try_get("stats").ok(),
            coordinates: row.try_get("coordinates").ok(),
            skills: row.try_get("skills").ok(),
            quests: row.try_get("quests")?,
            inventory: row.try_get("inventory").ok(),
            equipment: row.try_get("equipment").ok(),
            bank: row.try_get("bank").ok(),
            rune_pouch: row.try_get("rune_pouch").ok(),
            seed_vault: row.try_get("seed_vault").ok(),
            interacting: try_deserialize_json_column(&row, "interacting")?,
            diary_vars: row.try_get("diary_vars").ok(),
            shared_bank: Option::None,
            deposited: Option::None,
            collection_log_v2: row.try_get("collection_log").ok(),
        };
        result.push(group_member);
    }

    Ok(result)
}

pub enum AggregatePeriod {
    Day,
    Week,
    Month,
    Year,
}
async fn aggregate_skills_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    // Day buckets in 15-minute increments (rather than a full hour) so the
    // graph gets a new data point every ~5-20 minutes instead of only at the
    // top of the hour -- otherwise a recently-active member can appear
    // frozen for up to an hour. Week buckets hourly (its own table, distinct
    // from Month's daily buckets) so the 7-day graph gets ~168 points instead
    // of ~7 and feels like it's tracking in real time too.
    let truncate_expr = match period {
        AggregatePeriod::Day => {
            "date_trunc('hour', skills_last_update) + INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM skills_last_update) / 15)"
        }
        AggregatePeriod::Week => "date_trunc('hour', skills_last_update)",
        AggregatePeriod::Month => "date_trunc('day', skills_last_update)",
        AggregatePeriod::Year => "date_trunc('month', skills_last_update)",
    };
    let s = format!(
        r#"
INSERT INTO groupironman.skills_{} (member_id, time, skills)
SELECT member_id, {}, skills FROM groupironman.members
WHERE skills_last_update IS NOT NULL AND skills IS NOT NULL AND skills_last_update >= $1
ON CONFLICT (member_id, time)
DO UPDATE SET skills=excluded.skills;
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Week => "week",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        truncate_expr
    );
    let aggregate_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&aggregate_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

async fn apply_skills_retention_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM groupironman.skills_{0}
WHERE time < ($1::timestamptz - interval '{1}') AND (member_id, time) NOT IN (
  SELECT member_id, max(time) FROM groupironman.skills_{0} WHERE time < ($1::timestamptz - interval '{1}') GROUP BY member_id
)
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Week => "week",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "1 day",
            AggregatePeriod::Week => "7 days",
            AggregatePeriod::Month => "1 month",
            AggregatePeriod::Year => "1 year",
        }
    );
    let delete_old_rows_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_old_rows_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

pub async fn get_last_skills_aggregation(client: &Client) -> Result<DateTime<Utc>, ApiError> {
    let last_aggregation_stmt = client
        .prepare_cached(
            r#"
SELECT last_aggregation FROM groupironman.aggregation_info WHERE type='skills'"#,
        )
        .await?;
    let last_aggregation: DateTime<Utc> = client
        .query_one(&last_aggregation_stmt, &[])
        .await?
        .try_get(0)?;

    Ok(last_aggregation)
}

pub async fn aggregate_skills(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    let update_last_aggregation_stmt = transaction
        .prepare_cached(
            r#"
UPDATE groupironman.aggregation_info SET last_aggregation=NOW() WHERE type='skills'"#,
        )
        .await?;
    transaction
        .execute(&update_last_aggregation_stmt, &[])
        .await?;

    aggregate_skills_for_period(&transaction, AggregatePeriod::Day, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Week, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Month, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Year, &last_aggregation).await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn apply_skills_retention(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Day, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Week, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Month, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Year, &last_aggregation)
        .await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn get_skills_for_period(
    client: &Client,
    group_id: i64,
    period: AggregatePeriod,
) -> Result<GroupSkillData, ApiError> {
    let s = format!(
        r#"
SELECT member_name, time, s.skills
FROM groupironman.skills_{} s
INNER JOIN groupironman.members m ON m.member_id=s.member_id
WHERE m.group_id=$1
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Week => "week",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let get_skills_stmt = client.prepare_cached(&s).await?;
    let rows = client
        .query(&get_skills_stmt, &[&group_id])
        .await
        .map_err(ApiError::GetSkillsDataError)?;

    let mut member_data = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get("member_name")?;
        let skill_data = AggregateSkillData {
            time: row.try_get("time")?,
            data: row.try_get("skills")?,
        };

        if !member_data.contains_key(&member_name) {
            member_data.insert(
                member_name.clone(),
                MemberSkillData {
                    name: member_name,
                    skill_data: vec![skill_data],
                },
            );
        } else if let Some(member_skill_data) = member_data.get_mut(&member_name) {
            member_skill_data.skill_data.push(skill_data);
        }
    }

    Ok(member_data.into_values().collect())
}

pub async fn add_loot_drop(
    client: &Client,
    group_id: i64,
    loot_drop: &NewLootDrop,
) -> Result<(), ApiError> {
    let resolved_name = resolve_member_name(client, group_id, &loot_drop.member_name).await?;
    let member_id = match try_get_member_id(client, group_id, &resolved_name).await? {
        Some(member_id) => member_id,
        None => {
            return Err(ApiError::GroupMemberValidationError(format!(
                "No member named '{}' in this group",
                loot_drop.member_name
            )))
        }
    };

    let recorded_at = loot_drop.time.unwrap_or_else(Utc::now);

    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO groupironman.loot_drops (member_id, item_name, gp_value, image_url, screenshot_url, message_link, discord_message_id, embed_index, recorded_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (member_id, discord_message_id, embed_index) WHERE discord_message_id IS NOT NULL
DO UPDATE SET recorded_at = excluded.recorded_at, screenshot_url = excluded.screenshot_url, message_link = excluded.message_link
"#,
        )
        .await?;
    client
        .execute(
            &stmt,
            &[
                &member_id,
                &loot_drop.item_name,
                &loot_drop.gp_value,
                &loot_drop.image_url,
                &loot_drop.screenshot_url,
                &loot_drop.message_link,
                &loot_drop.discord_message_id,
                &loot_drop.embed_index,
                &recorded_at,
            ],
        )
        .await
        .map_err(ApiError::AddLootDropError)?;

    Ok(())
}

pub async fn get_loot_data(client: &Client, group_id: i64) -> Result<GroupLootData, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name, item_name, gp_value, image_url, screenshot_url, message_link, recorded_at
FROM groupironman.loot_drops d
INNER JOIN groupironman.members m ON m.member_id=d.member_id
WHERE m.group_id=$1
ORDER BY d.recorded_at ASC
"#,
        )
        .await?;
    let rows = client
        .query(&stmt, &[&group_id])
        .await
        .map_err(ApiError::GetLootDataError)?;

    let mut member_data = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get("member_name")?;
        let entry = LootDropEntry {
            item_name: row.try_get("item_name")?,
            gp_value: row.try_get("gp_value")?,
            image_url: row.try_get("image_url")?,
            screenshot_url: row.try_get("screenshot_url")?,
            message_link: row.try_get("message_link")?,
            time: row.try_get("recorded_at")?,
        };

        if !member_data.contains_key(&member_name) {
            member_data.insert(
                member_name.clone(),
                MemberLootData {
                    name: member_name,
                    drops: vec![entry],
                },
            );
        } else if let Some(member_loot_data) = member_data.get_mut(&member_name) {
            member_loot_data.drops.push(entry);
        }
    }

    Ok(member_data.into_values().collect())
}

pub async fn add_death(client: &Client, group_id: i64, death: &NewDeath) -> Result<(), ApiError> {
    let resolved_name = resolve_member_name(client, group_id, &death.member_name).await?;
    let member_id = match try_get_member_id(client, group_id, &resolved_name).await? {
        Some(member_id) => member_id,
        None => {
            return Err(ApiError::GroupMemberValidationError(format!(
                "No member named '{}' in this group",
                death.member_name
            )))
        }
    };

    let recorded_at = death.time.unwrap_or_else(Utc::now);

    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO groupironman.deaths (member_id, image_url, message_link, discord_message_id, recorded_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (member_id, discord_message_id) WHERE discord_message_id IS NOT NULL
DO UPDATE SET recorded_at = excluded.recorded_at, message_link = excluded.message_link
"#,
        )
        .await?;
    client
        .execute(
            &stmt,
            &[
                &member_id,
                &death.image_url,
                &death.message_link,
                &death.discord_message_id,
                &recorded_at,
            ],
        )
        .await
        .map_err(ApiError::AddDeathError)?;

    Ok(())
}

pub async fn get_death_data(client: &Client, group_id: i64) -> Result<GroupDeathData, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name, image_url, message_link, recorded_at
FROM groupironman.deaths d
INNER JOIN groupironman.members m ON m.member_id=d.member_id
WHERE m.group_id=$1
ORDER BY d.recorded_at ASC
"#,
        )
        .await?;
    let rows = client
        .query(&stmt, &[&group_id])
        .await
        .map_err(ApiError::GetDeathDataError)?;

    let mut member_data = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get("member_name")?;
        let entry = DeathEntry {
            image_url: row.try_get("image_url")?,
            message_link: row.try_get("message_link")?,
            time: row.try_get("recorded_at")?,
        };

        if !member_data.contains_key(&member_name) {
            member_data.insert(
                member_name.clone(),
                MemberDeathData {
                    name: member_name,
                    deaths: vec![entry],
                },
            );
        } else if let Some(member_death_data) = member_data.get_mut(&member_name) {
            member_death_data.deaths.push(entry);
        }
    }

    Ok(member_data.into_values().collect())
}

pub async fn set_member_discord_id(
    client: &Client,
    group_id: i64,
    member_name: &str,
    discord_id: Option<&str>,
) -> Result<(), ApiError> {
    let member_id = match try_get_member_id(client, group_id, member_name).await? {
        Some(member_id) => member_id,
        None => {
            return Err(ApiError::GroupMemberValidationError(format!(
                "No member named '{}' in this group",
                member_name
            )))
        }
    };

    let stmt = client
        .prepare_cached("UPDATE groupironman.members SET discord_id=$1 WHERE member_id=$2")
        .await?;
    client
        .execute(&stmt, &[&discord_id, &member_id])
        .await
        .map_err(ApiError::SetMemberDiscordIdError)?;

    Ok(())
}

pub async fn add_must_bank_item(
    client: &Client,
    group_id: i64,
    item_id: i32,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.must_bank_items (group_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .await?;
    client
        .execute(&stmt, &[&group_id, &item_id])
        .await
        .map_err(ApiError::MustBankItemError)?;

    Ok(())
}

pub async fn remove_must_bank_item(
    client: &Client,
    group_id: i64,
    item_id: i32,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.must_bank_items WHERE group_id=$1 AND item_id=$2")
        .await?;
    client
        .execute(&stmt, &[&group_id, &item_id])
        .await
        .map_err(ApiError::MustBankItemError)?;

    Ok(())
}

pub async fn get_group_member_names(
    client: &Client,
    group_id: i64,
) -> Result<Vec<String>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name FROM groupironman.members WHERE group_id=$1 AND member_name != $2",
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id, &SHARED_MEMBER]).await?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row.try_get(0)?);
    }
    Ok(result)
}

pub async fn get_must_bank_items(client: &Client, group_id: i64) -> Result<Vec<i32>, ApiError> {
    let stmt = client
        .prepare_cached("SELECT item_id FROM groupironman.must_bank_items WHERE group_id=$1")
        .await?;
    let rows = client
        .query(&stmt, &[&group_id])
        .await
        .map_err(ApiError::MustBankItemError)?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row.try_get("item_id")?);
    }
    Ok(result)
}

pub async fn add_manual_bank_ping(
    client: &Client,
    group_id: i64,
    member_name: &str,
    item_id: i32,
) -> Result<(), ApiError> {
    let member_id = match try_get_member_id(client, group_id, member_name).await? {
        Some(member_id) => member_id,
        None => {
            return Err(ApiError::GroupMemberValidationError(format!(
                "No member named '{}' in this group",
                member_name
            )))
        }
    };

    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.bank_pings (member_id, item_id, reason) VALUES ($1, $2, 'manual')",
        )
        .await?;
    client
        .execute(&stmt, &[&member_id, &item_id])
        .await
        .map_err(ApiError::RequestBankError)?;

    Ok(())
}

/// Decodes a raw `[item_id, quantity, item_id, quantity, ...]` column (the
/// same encoding the frontend's `transformItemsFromStorage` expects) into the
/// set of valid (id > 0) item ids present.
fn decode_item_ids(raw: &Option<Vec<i32>>) -> HashSet<i32> {
    let mut ids = HashSet::new();
    if let Some(items) = raw {
        let mut i = 0;
        while i + 1 < items.len() {
            if items[i] > 0 {
                ids.insert(items[i]);
            }
            i += 2;
        }
    }
    ids
}

// Both thresholds measure the same thing (time since last_updated), so this
// is effectively 20 extra minutes on top of the frontend's 20-minute
// "inactive" indicator (site/src/data/member-data.js, which itself matches
// OSRS's max AFK auto-logout timer) -- worst case, someone who walks away
// mid-session gets pinged 40 minutes after their last activity.
const INACTIVE_THRESHOLD_MINUTES: i64 = 40;
const BANK_PING_COOLDOWN_HOURS: i64 = 6;

/// Detects members who have been inactive for over `INACTIVE_THRESHOLD_MINUTES`
/// while still holding a tagged "must bank" item, records new offline pings
/// for them (deduped via a cooldown window), then drains and returns every
/// undelivered ping (offline + manual) for the group.
pub async fn poll_bank_pings(client: &Client, group_id: i64) -> Result<Vec<PendingBankPing>, ApiError> {
    let must_bank_items: HashSet<i32> = get_must_bank_items(client, group_id).await?.into_iter().collect();

    if !must_bank_items.is_empty() {
        let stmt = client
            .prepare_cached(
                r#"
SELECT member_id, equipment, inventory, bank,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update, seed_vault_last_update, diary_vars_last_update,
collection_log_last_update) as last_updated
FROM groupironman.members WHERE group_id=$1
"#,
            )
            .await?;
        let rows = client
            .query(&stmt, &[&group_id])
            .await
            .map_err(ApiError::PollBankPingsError)?;

        let now = Utc::now();
        let insert_sql = format!(
            r#"
INSERT INTO groupironman.bank_pings (member_id, item_id, reason)
SELECT $1, $2, 'offline'
WHERE NOT EXISTS (
    SELECT 1 FROM groupironman.bank_pings
    WHERE member_id=$1 AND item_id=$2 AND reason='offline' AND created_at > NOW() - INTERVAL '{} hours'
)
"#,
            BANK_PING_COOLDOWN_HOURS
        );
        let insert_stmt = client.prepare_cached(&insert_sql).await?;

        for row in rows {
            let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated").ok();
            let is_inactive = match last_updated {
                Some(last_updated) => now - last_updated > chrono::Duration::minutes(INACTIVE_THRESHOLD_MINUTES),
                None => false,
            };
            if !is_inactive {
                continue;
            }

            let member_id: i64 = row.try_get("member_id")?;
            let equipment: Option<Vec<i32>> = row.try_get("equipment").ok();
            let inventory: Option<Vec<i32>> = row.try_get("inventory").ok();
            let bank: Option<Vec<i32>> = row.try_get("bank").ok();

            let mut held_ids = decode_item_ids(&equipment);
            held_ids.extend(decode_item_ids(&inventory));
            held_ids.extend(decode_item_ids(&bank));

            for item_id in held_ids.intersection(&must_bank_items) {
                client
                    .execute(&insert_stmt, &[&member_id, item_id])
                    .await
                    .map_err(ApiError::PollBankPingsError)?;
            }
        }
    }

    let drain_stmt = client
        .prepare_cached(
            r#"
UPDATE groupironman.bank_pings p
SET delivered_at = NOW()
FROM groupironman.members m
WHERE p.member_id = m.member_id AND m.group_id = $1 AND p.delivered_at IS NULL
RETURNING m.member_name, m.discord_id, p.item_id, p.reason
"#,
        )
        .await?;
    let rows = client
        .query(&drain_stmt, &[&group_id])
        .await
        .map_err(ApiError::PollBankPingsError)?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(PendingBankPing {
            member_name: row.try_get("member_name")?,
            discord_id: row.try_get("discord_id").ok(),
            item_id: row.try_get("item_id")?,
            reason: row.try_get("reason")?,
        });
    }

    Ok(result)
}

pub async fn has_migration_run(client: &mut Client, name: &str) -> Result<bool, ApiError> {
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM groupironman.migrations WHERE name=$1",
            &[&name],
        )
        .await?
        .try_get(0)?;

    Ok(count > 0)
}

pub async fn commit_migration(transaction: &Transaction<'_>, name: &str) -> Result<(), ApiError> {
    transaction
        .execute(
            "INSERT INTO groupironman.migrations (name, date) VALUES($1, NOW())",
            &[&name],
        )
        .await?;

    Ok(())
}

pub async fn update_schema(client: &mut Client) -> Result<(), ApiError> {
    client
        .execute(
            r#"
CREATE TABLE IF NOT EXISTS groupironman.migrations (
    name TEXT,
    date TIMESTAMPTZ
)
"#,
            &[],
        )
        .await?;

    if !has_migration_run(client, "add_groups_version_column").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.groups ADD COLUMN IF NOT EXISTS version INTEGER default 1
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_groups_version_column").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "create_members_table").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.members (
  member_id BIGSERIAL PRIMARY KEY,
  group_id BIGSERIAL REFERENCES groupironman.groups(group_id),
  member_name TEXT NOT NULL,

  stats_last_update TIMESTAMPTZ,
  stats INTEGER[7],

  coordinates_last_update TIMESTAMPTZ,
  coordinates INTEGER[3],

  skills_last_update TIMESTAMPTZ,
  skills INTEGER[24],

  quests_last_update TIMESTAMPTZ,
  quests bytea,

  inventory_last_update TIMESTAMPTZ,
  inventory INTEGER[56],

  equipment_last_update TIMESTAMPTZ,
  equipment INTEGER[28],

  rune_pouch_last_update TIMESTAMPTZ,
  rune_pouch INTEGER[8],

  bank_last_update TIMESTAMPTZ,
  bank INTEGER[],

  seed_vault_last_update TIMESTAMPTZ,
  seed_vault INTEGER[],

  interacting_last_update TIMESTAMPTZ,
  interacting TEXT
);
"#,
                &[],
            )
            .await?;

        transaction.execute(r#"
CREATE UNIQUE INDEX IF NOT EXISTS members_groupid_name_idx ON groupironman.members (group_id, member_name);
"#, &[]).await?;

        commit_migration(&transaction, "create_members_table").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_diary_vars").await? {
        let transaction = client.transaction().await?;
        // Adding new columns for new types of data
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS diary_vars_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS diary_vars INTEGER[62]
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_diary_vars").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_skill_periods").await? {
        let transaction = client.transaction().await?;

        let periods = vec!["day", "month", "year"];
        for period in periods {
            let create_skills_aggregate = format!(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.skills_{} (
    member_id BIGSERIAL REFERENCES groupironman.members(member_id),
    time TIMESTAMPTZ,
    skills INTEGER[24],

    PRIMARY KEY (member_id, time)
);
"#,
                period
            );
            transaction.execute(&create_skills_aggregate, &[]).await?;
        }

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.aggregation_info (
    type TEXT PRIMARY KEY,
    last_aggregation TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMP WITH TIME ZONE 'epoch'
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
INSERT INTO groupironman.aggregation_info (type) VALUES ('skills')
ON CONFLICT (type) DO NOTHING
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_skill_periods").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "member_name_citext").await? {
        let transaction = client.transaction().await?;

        // We need to rename members in groups which would violate the unique constraint after
        // we make the column case insensitive.
        let duplicates = transaction
            .query(
                r#"
SELECT a.group_id, a.member_id, a.member_name FROM groupironman.members a
INNER JOIN (
	SELECT group_id, lower(member_name) as member_name, COUNT(*) FROM groupironman.members
	GROUP BY group_id, lower(member_name)
	HAVING COUNT(*) > 1
) b
ON a.group_id=b.group_id AND lower(a.member_name)=lower(b.member_name)
ORDER BY GREATEST(
	stats_last_update,
	coordinates_last_update,
	skills_last_update,
	quests_last_update,
	inventory_last_update,
	equipment_last_update,
	bank_last_update,
	rune_pouch_last_update,
	interacting_last_update,
	seed_vault_last_update,
	diary_vars_last_update
) ASC;
"#,
                &[],
            )
            .await?;

        let mut already_encounted: HashSet<String> = HashSet::new();
        for row in duplicates {
            let group_id: i64 = row.try_get("group_id")?;
            let member_id: i64 = row.try_get("member_id")?;
            let member_name: String = row.try_get("member_name")?;
            let member_name_lower: String = member_name.to_lowercase();

            let key = format!("{}::{}", group_id, member_name_lower);
            // Skip the first encounter with the duplicate name since that is the entry
            // with the most recent update.
            if !already_encounted.insert(key) {
                log::info!(
                    "Renaming duplicate member name '{}' in group '{}'",
                    member_name,
                    group_id
                );

                for _ in 1..5 {
                    let uuid = uuid::Uuid::new_v4().hyphenated().to_string();
                    let new_name = &uuid[..uuid.find("-").unwrap()];
                    log::info!("Trying new name '{}'", new_name);
                    if transaction
                        .execute(
                            "UPDATE groupironman.members SET member_name=$1 WHERE member_id=$2",
                            &[&new_name, &member_id],
                        )
                        .await
                        .is_ok()
                    {
                        break;
                    }
                }
            }
        }

        transaction
            .execute(
                "CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public",
                &[],
            )
            .await
            .ok();
        transaction
            .execute(
                "ALTER TABLE groupironman.members ALTER COLUMN member_name TYPE citext",
                &[],
            )
            .await?;

        commit_migration(&transaction, "member_name_citext").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_collection_log_member_column").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS collection_log_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS collection_log INTEGER[]
"#,
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_collection_log_member_column").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "migrate_collection_log_v2").await?
        && has_migration_run(client, "add_collection_log").await?
    {
        println!("beginning migration migrate_collection_log_v2");
        let transaction = client.transaction().await?;

        // collect the data to migrate
        let rows = transaction
            .query("SELECT member_id, items FROM groupironman.collection_log WHERE cardinality(items) > 0", &[])
            .await
            .unwrap();
        let mut member_data: HashMap<i64, Vec<i32>> = HashMap::new();
        for row in rows {
            let member_id: i64 = row.try_get("member_id")?;
            let items: Vec<i32> = row.try_get("items")?;

            match member_data.get_mut(&member_id) {
                Some(collection_log) => {
                    collection_log.extend(items.iter());
                }
                None => {
                    member_data.insert(member_id, items);
                }
            };
        }
        println!("need to migrate {} members", member_data.len());

        // breakup into chunks
        let chunk_size = 100;
        let member_data_list: Vec<(i64, Vec<i32>)> = member_data.into_iter().collect();
        let mut chunks = Vec::new();
        for chunk_slice in member_data_list.chunks(chunk_size) {
            let chunk_map: HashMap<i64, Vec<i32>> = chunk_slice.iter().cloned().collect();
            chunks.push(chunk_map);
        }
        println!("split into {} chunks of size {}", chunks.len(), chunk_size);

        // update new collection log column
        for (i, chunk) in chunks.iter().enumerate() {
            println!(
                "migrating chunk {}/{} size {}",
                i + 1,
                chunks.len(),
                chunk.len()
            );
            let mut values_clause = String::new();
            for i in 0..chunk.len() {
                values_clause.push_str(&format!(
                    "(${}::BIGINT, ${}::INTEGER[])",
                    i * 2 + 1,
                    i * 2 + 2
                ));
                if i < chunk.len() - 1 {
                    values_clause.push_str(", ");
                }
            }
            let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
            for (member_id, items) in chunk.iter() {
                params.push(member_id);
                params.push(items);
            }

            // timestamp is set to value that will return on the initial frontend request, but does not show the player as online
            let update_query = format!(
                r#"
UPDATE groupironman.members as a SET collection_log=b.collection_log, collection_log_last_update='epoch'::timestamptz + INTERVAL '5 days'
FROM (VALUES {}) AS b(member_id, collection_log)
WHERE a.member_id=b.member_id
"#,
                values_clause
            );

            transaction.execute(&update_query, &params).await?;
        }

        commit_migration(&transaction, "migrate_collection_log_v2").await?;
        transaction.commit().await?;
        println!("finished migration migrate_collection_log_v2");
    }

    if !has_migration_run(client, "update_timestamp_triggers").await? {
        let transaction = client.transaction().await?;

        let names = vec![
            "stats",
            "coordinates",
            "skills",
            "quests",
            "inventory",
            "equipment",
            "bank",
            "rune_pouch",
            "interacting",
            "seed_vault",
            "diary_vars",
            "collection_log",
        ];

        for name in names {
            let create_update_timestamp_fn = format!(
                r#"
CREATE OR REPLACE FUNCTION groupironman.update_{}_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.{}_last_update = now();
    RETURN NEW;
END;
$$ language 'plpgsql';
"#,
                name, name
            );
            transaction
                .execute(&create_update_timestamp_fn, &[])
                .await?;

            let trigger_stmt = format!(
                r#"
DO
$$BEGIN
  CREATE TRIGGER set_{}_timestamp
  BEFORE UPDATE ON groupironman.members
  FOR EACH ROW
  WHEN (OLD.{} IS DISTINCT FROM NEW.{})
  EXECUTE FUNCTION groupironman.update_{}_timestamp();
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;$$;
"#,
                name, name, name, name
            );
            transaction.execute(&trigger_stmt, &[]).await?;
        }

        commit_migration(&transaction, "update_timestamp_triggers").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "create_loot_and_death_tables").await? {
        let transaction = client.transaction().await?;

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.loot_drops (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES groupironman.members(member_id),
    item_name TEXT NOT NULL,
    gp_value BIGINT NOT NULL,
    image_url TEXT,
    discord_message_id TEXT,
    embed_index INTEGER NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE UNIQUE INDEX IF NOT EXISTS loot_drops_message_dedup ON groupironman.loot_drops (member_id, discord_message_id, embed_index) WHERE discord_message_id IS NOT NULL;
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE INDEX IF NOT EXISTS loot_drops_member_time_idx ON groupironman.loot_drops (member_id, recorded_at);
"#,
                &[],
            )
            .await?;

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.deaths (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES groupironman.members(member_id),
    image_url TEXT,
    discord_message_id TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE UNIQUE INDEX IF NOT EXISTS deaths_message_dedup ON groupironman.deaths (member_id, discord_message_id) WHERE discord_message_id IS NOT NULL;
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE INDEX IF NOT EXISTS deaths_member_time_idx ON groupironman.deaths (member_id, recorded_at);
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "create_loot_and_death_tables").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "create_bank_ping_tables").await? {
        let transaction = client.transaction().await?;

        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members ADD COLUMN IF NOT EXISTS discord_id TEXT;
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.must_bank_items (
    group_id BIGINT NOT NULL REFERENCES groupironman.groups(group_id),
    item_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, item_id)
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.bank_pings (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL REFERENCES groupironman.members(member_id),
    item_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE INDEX IF NOT EXISTS bank_pings_member_item_idx ON groupironman.bank_pings (member_id, item_id, created_at);
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "create_bank_ping_tables").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "create_name_changes_table").await? {
        let transaction = client.transaction().await?;

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.name_changes (
    group_id BIGINT NOT NULL REFERENCES groupironman.groups(group_id),
    old_name TEXT NOT NULL,
    new_name TEXT NOT NULL,
    PRIMARY KEY (group_id, old_name)
);
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "create_name_changes_table").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_screenshot_and_message_link_columns").await? {
        let transaction = client.transaction().await?;

        transaction
            .execute(
                r#"
ALTER TABLE groupironman.loot_drops
ADD COLUMN IF NOT EXISTS screenshot_url TEXT,
ADD COLUMN IF NOT EXISTS message_link TEXT;
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.deaths ADD COLUMN IF NOT EXISTS message_link TEXT;
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_screenshot_and_message_link_columns").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_skill_week_period").await? {
        let transaction = client.transaction().await?;

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.skills_week (
    member_id BIGSERIAL REFERENCES groupironman.members(member_id),
    time TIMESTAMPTZ,
    skills INTEGER[24],

    PRIMARY KEY (member_id, time)
);
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_skill_week_period").await?;
        transaction.commit().await?;
    }

    Ok(())
}
