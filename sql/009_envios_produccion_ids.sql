-- Guardar qué archivos concretos se enviaron a producción, para marcar las tareas a las que pertenecen.
alter table production_sends add column if not exists file_ids jsonb not null default '[]'::jsonb;
