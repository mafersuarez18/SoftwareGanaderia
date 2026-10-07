import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { entorno, esProduccion } from './config/entorno';
import { logger } from './config/logger';
import { manejarErrores, rutaNoEncontrada } from './compartido/middlewares/manejarErrores';

// Cada módulo de negocio expone su propio enrutador de Express; aquí solo
// se importan y se montan bajo su prefijo correspondiente.
import enrutadorAutenticacion from './modulos/autenticacion/autenticacion.rutas';
import enrutadorUsuarios from './modulos/usuarios/usuarios.rutas';
import enrutadorRoles from './modulos/roles/roles.rutas';
import enrutadorFincas from './modulos/fincas/fincas.rutas';
import enrutadorAnimales from './modulos/animales/animales.rutas';
import enrutadorHistorialMedico from './modulos/historialMedico/historialMedico.rutas';
import enrutadorVacunacion from './modulos/vacunacion/vacunacion.rutas';
import enrutadorReproduccion from './modulos/reproduccion/reproduccion.rutas';
import enrutadorInseminacion from './modulos/inseminacion/inseminacion.rutas';
import enrutadorGeolocalizacion from './modulos/geolocalizacion/geolocalizacion.rutas';
import enrutadorAlertas from './modulos/alertas/alertas.rutas';
import enrutadorReportes from './modulos/reportes/reportes.rutas';
import enrutadorAuditoria from './modulos/auditoria/auditoria.rutas';
import enrutadorAnalytics from './modulos/analytics/analytics.rutas';
import enrutadorNotificaciones from './modulos/notificaciones/notificaciones.rutas';
import enrutadorLotes from './modulos/lotes/lotes.rutas';

export function crearApp(): Application {
  const app = express();

  // ----- Seguridad -----
  app.use(helmet({
    contentSecurityPolicy: esProduccion,
    crossOriginEmbedderPolicy: esProduccion,
  }));

  // ----- CORS -----
  app.use(cors({
    origin: entorno.URL_FRONTEND,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
  }));

  // ----- Compresión gzip -----
  app.use(compression());

  // ----- Parseo de cuerpo -----
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ----- Logs de peticiones HTTP -----
  app.use(morgan(esProduccion ? 'combined' : 'dev', {
    stream: { write: (mensaje: string) => logger.http(mensaje.trim()) },
  }));

  // Tope general por IP para toda la API, como primera línea de defensa
  // contra abuso o bots. 100 resultó demasiado ajustado para un uso normal:
  // solo el polling de notificaciones (cada 30s) ya consume ~30 cada 15 min,
  // y con varios usuarios detrás del mismo IP (oficina/finca) más los
  // reintentos de la cola offline al recuperar señal, se agotaba con
  // facilidad en una sesión de uso real, no solo en un ataque.
  const limitadorGlobal = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { exito: false, mensaje: 'Demasiadas peticiones. Intente de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // El login es un blanco típico de fuerza bruta, así que tiene un límite
  // mucho más ajustado que el resto de la API.
  const limitadorAutenticacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { exito: false, mensaje: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
  });

  app.use('/api/', limitadorGlobal);

  // Endpoint simple para que herramientas de monitoreo (o el propio
  // frontend) comprueben que el backend está arriba, sin pasar por
  // autenticación ni tocar la base de datos.
  app.get('/health', (_req, res) => {
    res.json({ estado: 'activo', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  const baseApi = '/api';

  app.use(`${baseApi}/auth`, limitadorAutenticacion, enrutadorAutenticacion);
  app.use(`${baseApi}/usuarios`, enrutadorUsuarios);
  app.use(`${baseApi}/roles`, enrutadorRoles);
  app.use(`${baseApi}/fincas`, enrutadorFincas);
  app.use(`${baseApi}/animales`, enrutadorAnimales);
  app.use(`${baseApi}/historial-medico`, enrutadorHistorialMedico);
  app.use(`${baseApi}/vacunacion`, enrutadorVacunacion);
  app.use(`${baseApi}/reproduccion`, enrutadorReproduccion);
  app.use(`${baseApi}/inseminacion`, enrutadorInseminacion);
  app.use(`${baseApi}/geolocalizacion`, enrutadorGeolocalizacion);
  app.use(`${baseApi}/alertas`, enrutadorAlertas);
  app.use(`${baseApi}/reportes`, enrutadorReportes);
  app.use(`${baseApi}/auditoria`, enrutadorAuditoria);
  app.use(`${baseApi}/analytics`, enrutadorAnalytics);
  app.use(`${baseApi}/notificaciones`, enrutadorNotificaciones);
  app.use(`${baseApi}/lotes`, enrutadorLotes);

  // ----- Manejadores globales -----
  app.use(rutaNoEncontrada);
  app.use(manejarErrores);

  return app;
}
