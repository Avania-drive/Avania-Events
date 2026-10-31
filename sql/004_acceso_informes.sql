-- Los informes (con importes) piden usuario y contraseña; el desbloqueo dura un rato y es de cada sesión.
alter table sessions add column if not exists reports_until timestamptz;
