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
const WOM_PERIODS: [&str; 4] = ["day", "week", "month", "year"];
// Spacing between WOM calls during a refresh so a full 5-member x 4-period
// cycle stays comfortably under WOM's 20 req/60s unauthenticated limit.
const WOM_CALL_SPACING_MS: u64 = 500;

static WOM_GAINS: LazyLock<ArcSwapAny<Arc<String>>> =
    LazyLock::new(|| ArcSwap::from(Arc::new("{}".to_string())));

#[derive(Deserialize)]
struct WomGainedResponse {
    data: WomGainedData,
}
#[derive(Deserialize)]
struct WomGainedData {
    skills: HashMap<String, WomSkillGained>,
    #[serde(default)]
    bosses: HashMap<String, WomBossGained>,
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

fn display_name(wom_metric_key: &str) -> String {
    wom_metric_key
        .split('_')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Fetches one player's gains over `period` from WOM's per-player gains
/// endpoint. RSNs only ever contain letters, digits, spaces, hyphens and
/// underscores (enforced by our own `valid_name`), so a plain space->%20
/// replace is sufficient path-encoding here.
async fn fetch_player_gains(rsn: &str, period: &str) -> Result<WomPlayerGains, ApiError> {
    let encoded_rsn = rsn.replace(' ', "%20");
    let url = format!(
        "{}/players/{}/gained?period={}",
        WOM_BASE_URL, encoded_rsn, period
    );
    let user_agent = wom_user_agent();

    let response: WomGainedResponse = task::spawn_blocking(move || {
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

    let xp_gained = response
        .data
        .skills
        .get("overall")
        .map(|s| s.experience.gained)
        .unwrap_or(0);

    let top_skill = response
        .data
        .skills
        .iter()
        .filter(|(name, _)| name.as_str() != "overall")
        .max_by_key(|(_, gained)| gained.experience.gained)
        .filter(|(_, gained)| gained.experience.gained > 0);

    let top_boss = response
        .data
        .bosses
        .iter()
        .max_by_key(|(_, gained)| gained.kills.gained)
        .filter(|(_, gained)| gained.kills.gained > 0);

    Ok(WomPlayerGains {
        xp_gained,
        top_skill_name: top_skill.map(|(name, _)| display_name(name)),
        top_skill_xp: top_skill.map(|(_, gained)| gained.experience.gained),
        top_boss_name: top_boss.map(|(name, _)| display_name(name)),
        top_boss_kills: top_boss.map(|(_, gained)| gained.kills.gained),
    })
}

pub async fn update_wom_gains(db_pool: &Pool) -> Result<(), ApiError> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let stmt = client
        .prepare_cached("SELECT DISTINCT member_name FROM groupironman.members WHERE member_name != $1")
        .await?;
    let rows = client.query(&stmt, &[&SHARED_MEMBER]).await?;
    let member_names: Vec<String> = rows
        .into_iter()
        .map(|row| row.try_get(0))
        .collect::<Result<_, _>>()?;

    let mut all_gains: HashMap<String, HashMap<String, WomPlayerGains>> = HashMap::new();
    for period in WOM_PERIODS {
        let mut period_gains = HashMap::new();
        for member_name in &member_names {
            match fetch_player_gains(member_name, period).await {
                Ok(gains) => {
                    period_gains.insert(member_name.clone(), gains);
                }
                Err(err) => {
                    log::error!(
                        "Failed to fetch WOM gains for '{}' ({}): {}",
                        member_name,
                        period,
                        err
                    );
                }
            }
            time::sleep(Duration::from_millis(WOM_CALL_SPACING_MS)).await;
        }
        all_gains.insert(period.to_string(), period_gains);
    }

    WOM_GAINS.store(Arc::new(serde_json::to_string(&all_gains)?));
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

pub fn get_cached_wom_gains(period: &str) -> HashMap<String, WomPlayerGains> {
    let raw = WOM_GAINS.load();
    let all_gains: HashMap<String, HashMap<String, WomPlayerGains>> =
        serde_json::from_str(&raw).unwrap_or_default();
    all_gains.get(period).cloned().unwrap_or_default()
}
