-- House rule support: one super question per game (flag lives on the immutable per-game question row).
alter table game_questions add column is_super boolean not null default false;
create unique index game_questions_one_super on game_questions(game_id) where is_super and status <> 'voided';
