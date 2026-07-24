use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const SHARED_MEMBER: &str = "@SHARED";

#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Coordinates {
    x: i32,
    y: i32,
    plane: i32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Interacting {
    name: String,
    scale: i32,
    ratio: i32,
    location: Coordinates,
    #[serde(default = "default_last_updated")]
    last_updated: DateTime<Utc>,
}
fn default_last_updated() -> DateTime<Utc> {
    Utc::now()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameGroupMember {
    pub original_name: String,
    pub new_name: String,
}

#[derive(Deserialize, Serialize)]
pub struct GroupMember {
    #[serde(skip)]
    pub group_id: Option<i64>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coordinates: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quests: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipment: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bank: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_bank: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rune_pouch: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interacting: Option<Interacting>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_vault: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deposited: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diary_vars: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_log_v2: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discord_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}
#[derive(Serialize)]
pub struct AggregateSkillData {
    pub time: DateTime<Utc>,
    pub data: Vec<i32>,
}
#[derive(Serialize)]
pub struct MemberSkillData {
    pub name: String,
    pub skill_data: Vec<AggregateSkillData>,
}
pub type GroupSkillData = Vec<MemberSkillData>;

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct NewLootDrop {
    pub member_name: String,
    pub item_name: String,
    pub gp_value: i64,
    pub image_url: Option<String>,
    /// The actual gameplay screenshot (embed image/attachment), distinct
    /// from `image_url` which is just the item's wiki sprite.
    pub screenshot_url: Option<String>,
    /// Link back to the original Discord message the drop was posted in.
    pub message_link: Option<String>,
    pub discord_message_id: Option<String>,
    #[serde(default)]
    pub embed_index: i32,
    /// The Discord message's real timestamp, so backfilled history (via
    /// /scrape) doesn't get stamped with the scrape's run time instead of
    /// when the drop actually happened. Falls back to now() if omitted.
    pub time: Option<DateTime<Utc>>,
}
#[derive(Serialize)]
pub struct LootDropEntry {
    pub item_name: String,
    pub gp_value: i64,
    pub image_url: Option<String>,
    pub screenshot_url: Option<String>,
    pub message_link: Option<String>,
    pub time: DateTime<Utc>,
}
#[derive(Serialize)]
pub struct MemberLootData {
    pub name: String,
    pub drops: Vec<LootDropEntry>,
}
pub type GroupLootData = Vec<MemberLootData>;

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct NewDeath {
    pub member_name: String,
    pub image_url: Option<String>,
    pub message_link: Option<String>,
    pub discord_message_id: Option<String>,
    pub time: Option<DateTime<Utc>>,
}
#[derive(Serialize)]
pub struct DeathEntry {
    pub image_url: Option<String>,
    pub message_link: Option<String>,
    pub time: DateTime<Utc>,
}
#[derive(Serialize)]
pub struct MemberDeathData {
    pub name: String,
    pub deaths: Vec<DeathEntry>,
}
pub type GroupDeathData = Vec<MemberDeathData>;

#[derive(Serialize)]
pub struct BankPingEntry {
    pub reason: String,
    pub time: DateTime<Utc>,
    // Set identically for every item drained together in one poll_bank_pings
    // call, i.e. everything that ended up in the same batched Discord alert
    // (see bot/bankPings.js's discord_id:reason grouping) -- used to count
    // "how many times we actually pinged this person" instead of "how many
    // items they got pinged for".
    pub delivered_at: Option<DateTime<Utc>>,
}
#[derive(Serialize)]
pub struct MemberBankPingData {
    pub name: String,
    pub pings: Vec<BankPingEntry>,
}
pub type GroupBankPingData = Vec<MemberBankPingData>;

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StorageLogAction {
    Deposit,
    Withdraw,
}
#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct NewStorageLogEntry {
    pub member_name: String,
    /// Resolved by the bot from Dink's item name text via the same item
    /// database the site uses. Omitted (rather than erroring) when the name
    /// can't be resolved, since the log entry is still worth recording even
    /// if the cached-snapshot correction below has to be skipped.
    pub item_id: Option<i32>,
    pub item_name: String,
    pub quantity: i32,
    pub action: StorageLogAction,
    pub gp_value: Option<i64>,
    pub message_link: Option<String>,
    pub discord_message_id: Option<String>,
    #[serde(default)]
    pub entry_index: i32,
    pub time: Option<DateTime<Utc>>,
}
#[derive(Serialize)]
pub struct StorageLogEntry {
    pub member_name: String,
    pub item_name: String,
    pub quantity: i32,
    pub action: String,
    pub gp_value: Option<i64>,
    pub message_link: Option<String>,
    pub time: DateTime<Utc>,
}
pub type GroupStorageLog = Vec<StorageLogEntry>;

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct SetMemberDiscordId {
    pub member_name: String,
    pub discord_id: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct SetMemberColor {
    pub member_name: String,
    pub color: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct NameChange {
    pub old_name: String,
    pub new_name: String,
}

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct MustBankItem {
    pub item_id: i32,
}

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct RequestBank {
    pub member_name: String,
    pub item_id: i32,
}

#[derive(Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct RequestBankBatch {
    pub requests: Vec<RequestBank>,
}

#[derive(Serialize)]
pub struct PendingBankPing {
    pub member_name: String,
    pub discord_id: Option<String>,
    pub item_id: i32,
    pub reason: String,
    /// How many of item_id the member is currently holding (equipment +
    /// inventory + bank combined), looked up fresh at delivery time so the
    /// Discord alert can say "23 x Rune arrow" instead of just naming the
    /// item with no sense of how much is actually sitting there.
    pub quantity: i64,
}

/// Non-destructive read of recent bank pings, for the frontend's toast
/// notifications. Deliberately separate from `PendingBankPing`/
/// `poll_bank_pings`, which drains the queue and is exclusively for the
/// Discord bot's delivery loop -- the site must never call that endpoint,
/// or it would race the bot and steal pings meant for Discord.
#[derive(Serialize)]
pub struct RecentBankPing {
    pub member_name: String,
    pub item_id: i32,
    pub reason: String,
    pub created_at: DateTime<Utc>,
}
pub type RecentBankPings = Vec<RecentBankPing>;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateGroup {
    pub name: String,
    pub member_names: Vec<String>,
    #[serde(default, skip_serializing)]
    pub captcha_response: String,
    #[serde(default = "default_token")]
    #[serde(skip_deserializing)]
    pub token: String,
}
fn default_token() -> String {
    uuid::Uuid::new_v4().hyphenated().to_string()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AmIInGroupRequest {
    pub member_name: String,
}
#[derive(Deserialize)]
pub struct WikiGEPrice {
    pub high: Option<i64>,
    pub low: Option<i64>,
}
#[derive(Deserialize)]
pub struct WikiGEPrices {
    pub data: std::collections::HashMap<i32, WikiGEPrice>,
}
pub type GEPrices = std::collections::HashMap<i32, i64>;
#[derive(Deserialize)]
pub struct CaptchaVerifyResponse {
    pub success: bool,
    // NOTE: unused
    // #[serde(rename = "error-codes", default)]
    // pub error_codes: std::vec::Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WomSkillGainEntry {
    pub name: String,
    pub xp: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WomBossGainEntry {
    pub name: String,
    pub kills: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WomPlayerGains {
    pub xp_gained: i64,
    pub top_skill_name: Option<String>,
    pub top_skill_xp: Option<i64>,
    pub top_boss_name: Option<String>,
    pub top_boss_kills: Option<i64>,
    pub skills_gained: Vec<WomSkillGainEntry>,
    pub bosses_gained: Vec<WomBossGainEntry>,
}
