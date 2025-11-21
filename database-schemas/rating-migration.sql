-- Migration to add title field to ratings table
-- Run this if title column doesn't exist

ALTER TABLE ratings ADD COLUMN title TEXT;

