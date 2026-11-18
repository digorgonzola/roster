-- Households (docs/setup.md, "Households"). Each household's roster is the RosterRoom Durable Object
-- named by households.id. Each person is in exactly one household.

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Read-only calendar feed token; NULL until a member enables the feed.
  cal_token TEXT UNIQUE,
  created_at TEXT NOT NULL
);

-- The primary key keeps a person in one household.
CREATE TABLE memberships (
  email TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id),
  joined_at TEXT NOT NULL
);
CREATE INDEX memberships_household ON memberships (household_id);

CREATE TABLE household_invites (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id),
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  accepted_at TEXT
);
-- One pending invite per person per household. An accepted invite stays as history.
CREATE UNIQUE INDEX household_invites_pending ON household_invites (household_id, email) WHERE accepted_at IS NULL;
-- The invites waiting for a person, read on every /api/me.
CREATE INDEX household_invites_email_pending ON household_invites (email) WHERE accepted_at IS NULL;

-- The roster shared before households existed. Fixed id: it is the existing RosterRoom name, and
-- DEFAULT_HOUSEHOLD_ID in worker/households.ts uses it.
INSERT INTO households (id, name, created_at)
VALUES ('10fef99a-d5dc-465f-9c6b-6e149637dd17', 'Household', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
