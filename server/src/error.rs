use actix_web::{HttpResponse, ResponseError};
use deadpool_postgres::PoolError;
use derive_more::{Display, From};

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Display, From)]
pub enum ApiError {
    PoolError(PoolError),
    PGError(tokio_postgres::error::Error),
    SerdeJsonError(serde_json::Error),
    #[from(ignore)]
    GroupCreationError(tokio_postgres::error::Error),
    #[from(ignore)]
    UpdateGroupMemberError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetGroupError(tokio_postgres::error::Error),
    #[from(ignore)]
    AddMemberError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetGroupDataError(tokio_postgres::error::Error),
    #[from(ignore)]
    DeleteGroupMemberError(tokio_postgres::error::Error),
    #[from(ignore)]
    RenameGroupMemberError(tokio_postgres::error::Error),
    #[from(ignore)]
    IsMemberInGroupError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetSkillsDataError(tokio_postgres::error::Error),
    #[from(ignore)]
    AddLootDropError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetLootDataError(tokio_postgres::error::Error),
    #[from(ignore)]
    AddDeathError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetDeathDataError(tokio_postgres::error::Error),
    #[from(ignore)]
    SetMemberDiscordIdError(tokio_postgres::error::Error),
    #[from(ignore)]
    MustBankItemError(tokio_postgres::error::Error),
    #[from(ignore)]
    RequestBankError(tokio_postgres::error::Error),
    #[from(ignore)]
    PollBankPingsError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetRecentBankPingsError(tokio_postgres::error::Error),
    #[from(ignore)]
    AddStorageLogError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetStorageLogError(tokio_postgres::error::Error),
    GroupFullError,
    UreqError(ureq::Error),
    GroupMemberValidationError(String),
}
impl std::error::Error for ApiError {}
fn handle_pg_error(err: &tokio_postgres::error::Error, name: &str) -> HttpResponse {
    match err.as_db_error() {
        Some(db_error) => log::error!("{}: {}", name, db_error.message()),
        None => log::error!("{}: {}", name, err),
    };

    HttpResponse::InternalServerError().finish()
}
impl ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        match *self {
            ApiError::PoolError(ref err) => {
                log::error!("PoolError: {}", err);
                HttpResponse::InternalServerError().body(format!("PoolError: {}", err))
            }
            ApiError::GroupCreationError(ref err) => handle_pg_error(err, "GroupCreationError"),
            ApiError::UpdateGroupMemberError(ref err) => {
                handle_pg_error(err, "UpdateGroupMemberError")
            }
            ApiError::PGError(ref err) => handle_pg_error(err, "PGError"),
            ApiError::GetGroupError(ref err) => handle_pg_error(err, "GetGroupError"),
            ApiError::AddMemberError(ref err) => handle_pg_error(err, "AddMemberError"),
            ApiError::GetGroupDataError(ref err) => handle_pg_error(err, "GetGroupDataError"),
            ApiError::IsMemberInGroupError(ref err) => handle_pg_error(err, "IsMemberInGroupError"),
            ApiError::GetSkillsDataError(ref err) => handle_pg_error(err, "GetSkillsDataError"),
            ApiError::AddLootDropError(ref err) => handle_pg_error(err, "AddLootDropError"),
            ApiError::GetLootDataError(ref err) => handle_pg_error(err, "GetLootDataError"),
            ApiError::AddDeathError(ref err) => handle_pg_error(err, "AddDeathError"),
            ApiError::GetDeathDataError(ref err) => handle_pg_error(err, "GetDeathDataError"),
            ApiError::SetMemberDiscordIdError(ref err) => {
                handle_pg_error(err, "SetMemberDiscordIdError")
            }
            ApiError::MustBankItemError(ref err) => handle_pg_error(err, "MustBankItemError"),
            ApiError::RequestBankError(ref err) => handle_pg_error(err, "RequestBankError"),
            ApiError::PollBankPingsError(ref err) => handle_pg_error(err, "PollBankPingsError"),
            ApiError::GetRecentBankPingsError(ref err) => {
                handle_pg_error(err, "GetRecentBankPingsError")
            }
            ApiError::AddStorageLogError(ref err) => handle_pg_error(err, "AddStorageLogError"),
            ApiError::GetStorageLogError(ref err) => handle_pg_error(err, "GetStorageLogError"),
            ApiError::DeleteGroupMemberError(ref err) => {
                handle_pg_error(err, "DeleteGroupMemberError")
            }
            ApiError::RenameGroupMemberError(ref err) => {
                handle_pg_error(err, "RenameGroupMemberError")
            }
            ApiError::SerdeJsonError(ref err) => {
                log::error!("SerdeJsonError: {}", err);
                HttpResponse::InternalServerError().body(format!("SerdeJsonError: {}", err))
            }
            ApiError::GroupFullError => HttpResponse::BadRequest()
                .body("Group has already reached the maximum amount of players"),
            ApiError::UreqError(ref err) => {
                log::error!("UreqError: {}", err);
                HttpResponse::InternalServerError().body(format!("UreqError: {}", err))
            }
            ApiError::GroupMemberValidationError(ref reason) => {
                log::error!("Validation error: {}", reason);
                HttpResponse::BadRequest().body(reason.clone())
            }
        }
    }
}
