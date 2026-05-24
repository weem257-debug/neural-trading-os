-- Trading Dashboard — PostgreSQL initialization
-- Run automatically on first container start

CREATE TABLE IF NOT EXISTS signals (
    id UUID PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    confidence FLOAT NOT NULL,
    price_target FLOAT,
    stop_loss FLOAT,
    time_horizon VARCHAR(20),
    reasoning TEXT,
    source VARCHAR(100),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agents_consensus JSONB
);

CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity FLOAT NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    filled_price FLOAT,
    broker VARCHAR(50),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_value FLOAT NOT NULL,
    cash FLOAT NOT NULL,
    invested FLOAT NOT NULL,
    total_pnl FLOAT NOT NULL,
    total_pnl_pct FLOAT NOT NULL,
    day_pnl FLOAT NOT NULL,
    day_pnl_pct FLOAT NOT NULL,
    positions JSONB
);

CREATE TABLE IF NOT EXISTS backtest_jobs (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    request JSONB NOT NULL,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signals_ticker ON signals(ticker);
CREATE INDEX IF NOT EXISTS idx_signals_generated_at ON signals(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ticker ON orders(ticker);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots(timestamp DESC);
