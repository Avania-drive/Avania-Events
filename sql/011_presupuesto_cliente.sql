-- Presupuesto a cliente: el importe con el que se factura la acción. El coste de las tareas se resta de él para el resultado.
alter table events add column if not exists budget numeric(12,2);
