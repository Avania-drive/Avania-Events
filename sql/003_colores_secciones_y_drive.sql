-- Color de cada sección de tareas y carpeta de Google Drive de cada acción.
alter table task_sections add column if not exists color text not null default '#667085';
update task_sections set color = case name
  when 'Montaje' then '#ea7a1a' when 'Creatividades' then '#db2777' when 'Personal' then '#7c3aed' when 'Materiales' then '#667085'
  when 'Premios y mercancías' then '#16a34a' when 'Patrocinadores' then '#dc2626' when 'Medios' then '#ca8a04' when 'Documentación' then '#2563eb'
  else color end;
alter table events add column if not exists drive_folder_id text;
