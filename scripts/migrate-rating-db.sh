#!/bin/bash

# Script to migrate rating database to add title column
# Usage: ./scripts/migrate-rating-db.sh [--remote]

set -e

REMOTE_FLAG=""
if [ "$1" == "--remote" ]; then
  REMOTE_FLAG="--remote"
  echo "Running migration on REMOTE database..."
else
  echo "Running migration on LOCAL database..."
fi

echo "Adding title column to ratings table..."

wrangler d1 execute rating-db $REMOTE_FLAG --file=./database-schemas/rating-migration.sql

echo "Migration completed successfully!"

