-- Rollback for 0001_init. DESTRUCTIVE: drops every ElimQuest table. Export first (see docs/OPERATIONS.md).
drop table if exists email_log, practice_sessions, usage_history, topic_votes, game_results, round_outcomes,
  answers, rounds, participants, game_questions, games, platform_settings, audit_events, content_reports,
  import_batches, review_decisions, question_options, question_versions, questions, packs,
  difficulty_definitions, categories, profiles cascade;
drop function if exists enforce_question_ready();
