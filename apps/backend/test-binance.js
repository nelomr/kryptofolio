import { WebSocket } from 'ws';
const ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btceur@ticker/ethusdt@ticker/etheur@ticker/solusdt@ticker/soleur@ticker/adausdt@ticker/adaeur@ticker');

ws.on('open', () => {
  console.log('Connected to Binance');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (err) => {
  console.error('Error:', err);
});

setTimeout(() => ws.close(), 5000);
