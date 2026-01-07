// api/create-order.js
// Función serverless para crear órdenes en OKX desde n8n

import crypto from 'crypto';

export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Obtener datos del request de n8n
    const { signal } = req.body;

    if (!signal || !signal.ticker || !signal.side) {
      return res.status(400).json({ 
        error: 'Missing required fields: signal.ticker and signal.side' 
      });
    }

    // Configuración de OKX (usa variables de entorno)
    const API_KEY = process.env.OKX_API_KEY;
    const SECRET_KEY = process.env.OKX_SECRET_KEY;
    const PASSPHRASE = process.env.OKX_PASSPHRASE;

    if (!API_KEY || !SECRET_KEY || !PASSPHRASE) {
      return res.status(500).json({ 
        error: 'Missing OKX credentials in environment variables' 
      });
    }

    // Generar timestamp
    const timestamp = new Date().toISOString();

    // Construir body de la orden
    const side = signal.side.toLowerCase();
    
    const orderBody = {
      instId: signal.ticker + '-SWAP',
      tdMode: 'cross',
      side: side,
      posSide: side === 'buy' ? 'long' : 'short',
      ordType: 'market',
      sz: '1'
    };

    // Agregar SL/TP usando attachAlgoOrds (formato correcto de OKX)
    if (signal.stopLoss || signal.target) {
      orderBody.attachAlgoOrds = [];
      
      // Combinar SL y TP en un solo objeto
      const algoOrder = {
        tpTriggerPxType: 'last',
        slTriggerPxType: 'last'
      };
      
      // Stop Loss
      if (signal.stopLoss) {
        algoOrder.slTriggerPx = String(signal.stopLoss);
        algoOrder.slOrdPx = '-1';
      } else {
        algoOrder.slTriggerPx = '';
        algoOrder.slOrdPx = '';
      }
      
      // Take Profit
      if (signal.target) {
        algoOrder.tpTriggerPx = String(signal.target);
        algoOrder.tpOrdPx = '-1';
      } else {
        algoOrder.tpTriggerPx = '';
        algoOrder.tpOrdPx = '';
      }
      
      orderBody.attachAlgoOrds.push(algoOrder);
    }

    // Convertir a string
    const bodyString = JSON.stringify(orderBody);

    // Crear prehash
    const method = 'POST';
    const requestPath = '/api/v5/trade/order';
    const prehash = timestamp + method + requestPath + bodyString;

    // Calcular firma HMAC SHA256
    const sign = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(prehash)
      .digest('base64');

    // Hacer petición a OKX
    const response = await fetch('https://www.okx.com/api/v5/trade/order', {
      method: 'POST',
      headers: {
        'OK-ACCESS-KEY': API_KEY,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': PASSPHRASE,
        'Content-Type': 'application/json'
      },
      body: bodyString
    });

    const data = await response.json();

    // Retornar respuesta de OKX
    return res.status(response.status).json({
      success: response.ok,
      data: data,
      debug: {
        timestamp,
        orderBody,
        hasAttachedOrders: !!orderBody.attachAlgoOrds
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
