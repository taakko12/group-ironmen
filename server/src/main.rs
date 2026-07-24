use server::auth_middleware::AuthenticateMiddlewareFactory;
use server::authed;
use server::config::Config;
use server::db;
use server::models;
use server::unauthed;
use server::update_batcher;
use server::wom;

use actix_cors::Cors;
use actix_web::{http::header, middleware, web, App, HttpServer};
use tokio::sync::mpsc;
use tokio_postgres_rustls::MakeRustlsConnect;

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

/// Builds a TLS connector for Postgres. Supabase (and most managed Postgres)
/// require SSL; local/docker-compose Postgres without SSL still works because
/// tokio-postgres defaults to sslmode=prefer and falls back to plaintext when
/// the server declines the SSL request.
/// Supabase's Postgres/pooler certs are signed by their own private CA, which
/// isn't in any public trust store, so it has to be pinned explicitly.
const SUPABASE_CA_PEM: &[u8] = include_bytes!("supabase-ca.pem");

fn tls_connector() -> MakeRustlsConnect {
    let mut root_store = rustls::RootCertStore::empty();
    for cert in rustls_native_certs::load_native_certs().certs {
        let _ = root_store.add(cert);
    }
    let mut supabase_ca_reader = std::io::BufReader::new(SUPABASE_CA_PEM);
    for cert in rustls_pemfile::certs(&mut supabase_ca_reader).flatten() {
        let _ = root_store.add(cert);
    }
    let tls_config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    MakeRustlsConnect::new(tls_config)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("failed to install rustls crypto provider");

    let config = Config::from_env().unwrap();
    let pool = config.pg.create_pool(None, tls_connector()).unwrap();
    env_logger::init_from_env(
        env_logger::Env::new().default_filter_or(config.logger.level.to_string()),
    );

    let mut client = pool.get().await.unwrap();
    db::update_schema(&mut client).await.unwrap();

    unauthed::start_ge_updater();
    unauthed::start_skills_aggregator(pool.clone());
    wom::start_wom_updater(pool.clone());

    let update_batcher_pool = config.pg.create_pool(None, tls_connector()).unwrap();
    let (tx, rx) = mpsc::channel::<models::GroupMember>(10000);
    tokio::spawn(async move {
        update_batcher::background_worker(update_batcher_pool, rx, None).await;
    });
    let auth_cache = std::sync::Arc::new(server::auth_middleware::AuthenticationCache::new());

    HttpServer::new(move || {
        let unauthed_scope = web::scope("/api")
            .service(unauthed::create_group)
            .service(unauthed::get_ge_prices)
            .service(unauthed::captcha_enabled);
        let authed_scope = web::scope("/api/group/{group_name}")
            .wrap(AuthenticateMiddlewareFactory::new(auth_cache.clone()))
            .service(authed::update_group_member)
            .service(authed::get_group_data)
            .service(authed::add_group_member)
            .service(authed::delete_group_member)
            .service(authed::rename_group_member)
            .service(authed::am_i_logged_in)
            .service(authed::am_i_in_group)
            .service(authed::get_skill_data)
            .service(authed::add_loot_drop)
            .service(authed::get_loot_data)
            .service(authed::add_death)
            .service(authed::get_death_data)
            .service(authed::add_storage_log_entry)
            .service(authed::get_storage_log)
            .service(authed::set_member_discord_id)
            .service(authed::add_must_bank_item)
            .service(authed::remove_must_bank_item)
            .service(authed::get_must_bank_items)
            .service(authed::request_bank)
            .service(authed::request_bank_batch)
            .service(authed::poll_bank_pings)
            .service(authed::get_recent_bank_pings)
            .service(authed::add_name_change)
            .service(authed::get_wom_gains)
            .service(authed::get_wom_boss_kc)
            .service(authed::get_collection_log);
        let json_config = web::JsonConfig::default().limit(100000);
        let cors = Cors::default()
            .allow_any_origin()
            .send_wildcard()
            .allowed_methods(vec!["GET", "POST", "DELETE", "PUT", "OPTIONS"])
            .allowed_headers(vec![
                header::AUTHORIZATION,
                header::ACCEPT,
                header::CONTENT_TYPE,
                header::CONTENT_LENGTH,
            ])
            .max_age(3600);
        App::new()
            .wrap(middleware::Logger::new(
                "\"%r\" %s %b \"%{User-Agent}i\" %D",
            ))
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .app_data(web::PayloadConfig::new(100000))
            .app_data(json_config)
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(tx.clone()))
            .service(authed_scope)
            .service(unauthed_scope)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
