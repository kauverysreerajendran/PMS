ALTER TABLE reservations ADD COLUMN IF NOT EXISTS total_amount INTEGER;

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    reservation_id INTEGER NOT NULL REFERENCES reservations(id),
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    received_by_user_id INTEGER NOT NULL REFERENCES users(id),
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_payments_property_reservation
    ON payments (property_id, reservation_id);
