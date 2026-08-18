import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { configDotenv } from 'dotenv';
configDotenv();

const PORT = process.env.SERVER_PORT;

const DEPARTURES = ['BALCAO', 'INFORMATICA', 'CERTIFICADO', 'SISTEMA'];

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const deviceByDeparture = {
  BALCAO: new Set(),
  INFORMATICA: new Set(),
  CERTIFICADO: new Set(),
  SISTEMA: new Set(),
};

function validDeparture(departure) {
  return DEPARTURES.includes(departure);
}

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

app.get('/status', (req, res) => {
  const status = {};
  for (const departure of DEPARTURES) {
    status[departure] = deviceByDeparture[departure]?.size || 0;
  }

  res.json({
    online: true,
    departures: status,
    totalDevices: Object.values(deviceByDeparture).reduce(
      (sum, set) => sum + set.size,
      0,
    ),
  });
});

io.on('connection', (socket) => {
  socket.currentDeparture = null;

  socket.on('register', (payload, callback) => {
    const departure = payload && payload.departure;

    if (!validDeparture(departure)) {
      const err = { success: false, error: 'Departamento inválido!' };
      if (typeof callback === 'function') callback(err);
      return;
    }

    if (socket.currentDeparture) {
      deviceByDeparture[socket.currentDeparture].delete(socket.id);
      socket.leave(socket.currentDeparture);
    }

    socket.join(departure);
    socket.currentDeparture = departure;
    deviceByDeparture[departure].add(socket.id);

    const response = { success: true, departure };
    if (typeof callback === 'function') callback(response);
  });

  socket.on('new-call', (payload, callback) => {
    const departure = payload && payload.departure;
    const from = socket.currentDeparture;

    if (!validDeparture(departure)) {
      const err = { success: false, error: 'Departamento inválido' };
      if (typeof callback === 'function') callback(err);
      return;
    }

    const call = {
      departure,
      from,
      timestamp: Date.now(),
    };

    io.to(departure).emit('received-call', call);

    const response = {
      success: true,
      departure,
      destination: deviceByDeparture[departure].size,
    };
    if (typeof callback === 'function') callback(response);
  });

  socket.on('call-answered', (payload, callback) => {
    const departure = payload && payload.departure;

    if (!validDeparture(departure)) {
      const err = { success: false, error: 'Departamento inválido' };
      if (typeof callback === 'function') callback(err);
      return;
    }

    if (socket.currentDeparture !== departure) {
      const err = {
        success: false,
        error: 'Dispositivo não está registrado neste departamento',
      };
      if (typeof callback === 'function') callback(err);
      return;
    }

    const call = {
      departure: departure,
      answered: true,
      timestamp: Date.now(),
      answeredBy: socket.id,
    };

    socket.to(departure).emit('call-answered', call);

    const response = {
      success: true,
      message: 'Chamada atendida',
    };

    if (typeof callback === 'function') callback(response);
  });

  socket.on('disconnect', () => {
    if (socket.currentDeparture) {
      deviceByDeparture[socket.currentDeparture].delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de notificações de balcão rodando na porta ${PORT}`);
});
