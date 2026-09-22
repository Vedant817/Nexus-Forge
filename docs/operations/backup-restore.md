# Backup and restore (pilot)

RPO 24 hours, RTO 4 hours for active systems. Automated encrypted database
backups run daily and retain for 14 days. Backup expiry follows the hosting
schedule; backups are never restored for deleted tenants.

Restore drill (quarterly): provision a clean environment from
`deploy/pilot-compose.yml`, restore the latest backup to an isolated database,
run migrations, verify `/api/ready`, and confirm the stated RPO/RTO. Record the
drill date, duration, and outcome. Restores must never resurrect deleted customer
content: verify absence of tombstoned tenants before promotion.
