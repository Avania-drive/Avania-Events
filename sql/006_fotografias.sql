-- Fotografías del evento: archivos de la carpeta «Fotografías» de la acción, sin tarea concreta.
alter table task_files alter column task_id drop not null;
create unique index if not exists task_files_event_only_idx on task_files(event_id, drive_file_id) where task_id is null;
