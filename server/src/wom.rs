use crate::error::ApiError;
use crate::models::{WomPlayerGains, SHARED_MEMBER};
use arc_swap::{ArcSwap, ArcSwapAny};
use deadpool_postgres::Pool;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::{task, time};

const WOM_BASE_URL: &str = "https://api.wiseoldman.net/v2";
const WOM_PERIOD: &str = "week";

static WOM_GAINS: LazyLock<ArcSwapAny<Arc<String>>> =
    LazyLock::new(|| ArcSwap::from(Arc::new("{}".to_string())));

#[derive(Deserialize)]
struct WomGainedResponse {
    data: WomGainedData,
}
#[derive(Deserialize)]
struct WomGainedData {
    skills: WomSkills,
    #[serde(default)]
    bosses: HashMap<String, WomBossGained>,
}
#[derive(Deserialize)]
struct WomSkills {
    overall: WomSkillGained,
}
#[derive(Deserialize)]
struct WomSkillGained {
    experience: WomGainedValue,
}
#[derive(Deserialize)]
struct WomBossGained {
    kills: WomGainedValue,
}
#[derive(Deserialize)]
struct WomGainedValue {
    gained: i64,
}

fn wom_user_agent() -> String {
    std::env::var("WOM_USER_AGENT").unwrap_or_else(|_| "group-ironmen-tracker".to_string())
}

/// Fetches one player's (xp_gained, kills_gained) over `WOM_PERIOD` from
/// WOM's per-player gains endpoint. RSNs only ever contain letters, digits,
/// spaces, hyphens and underscores (enforced by our own `valid_name`), so a
/// plain space->%20 replace is sufficient path-encoding here.
async fn fetch_player_gains(rsn: &str) -> Result<(i64, i64), ApiError> {
    let encoded_rsn = rsn.replace(' ', "%20");
    let url = format!(
        "{}/players/{}/gained?period={}",
        WOM_BASE_URL, encoded_rsn, WOM_PERIOD
    );
    let user_agent = wom_user_agent();

    let response = task::spawn_blocking(move || {
        ureq::get(&url)
            .header("User-Agent", &user_agent)
            .call()
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<WomGainedResponse>()
            .map_err(ApiError::UreqError)
    })
    .await
    .unwrap()?;

    let xp_gained = response.data.skills.overall.experience.gained;
    let kills_gained: i64 = response
        .data
        .bosses
        .values()
        .map(|boss| boss.kills.gained.max(0))
        .sum();

    Ok((xp_gained, kills_gained))
}

pub async fn update_wom_gains(db_pool: &Pool) -> Result<(), ApiError> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let stmt = client
        .prepare_cached("SELECT DISTINCT member_name FROM groupironman.members WHERE member_name != $1")
        .await?;
    let rows = client.query(&stmt, &[&SHARED_MEMBER]).await?;

    let mut gains: HashMap<String, WomPlayerGains> = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get(0)?;
        match fetch_player_gains(&member_name).await {
            Ok((xp_gained, kills_gained)) => {
                gains.insert(
                    member_name,
                    WomPlayerGains {
                        xp_gained,
                        kills_gained,
                    },
                );
            }
            Err(err) => {
                log::error!("Failed to fetch WOM gains for '{}': {}", member_name, err);
            }
        }
    }

    WOM_GAINS.store(Arc::new(serde_json::to_string(&gains)?));
    Ok(())
}

pub fn start_wom_updater(db_pool: Pool) {
    task::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(600));

        loop {
            interval.tick().await;
            log::info!("Fetching WOM gains");

            if let Err(err) = update_wom_gains(&db_pool).await {
                log::error!("Failed to update WOM gains: {}", err);
            }
        }
    });
}

pub fn get_cached_wom_gains() -> HashMap<String, WomPlayerGains> {
    let raw = WOM_GAINS.load();
    serde_json::from_str(&raw).unwrap_or_default()
}
