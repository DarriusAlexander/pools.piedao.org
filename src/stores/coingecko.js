import { writable } from 'svelte/store';
import poolsConfig from '../config/pools.json';

const store = writable({});

export const piesMarketDataStore = store;

async function request(uri, params = {}, method = 'GET') {
  let url = uri;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (params) {
    if (method === 'GET') {
      url += `?${objectToQueryString(params)}`;
    } else {
      options.body = JSON.stringify(params);
    }
  }
  const response = await fetch(url, options);

  if (response.status !== 200) {
    console.error('The server responded with an unexpected status.', response.status);
    return response.status;
  }

  const result = await response.json();
  // console.log('piesMarketDataStore', result)

  return result;
}

function objectToQueryString(obj) {
  return Object.keys(obj)
    .map((key) => `${key}=${obj[key]}`)
    .join('&');
}

export class CoinGecko {
  static async sync() {
    await CoinGecko.fetchAssetPrices();
    const event = new Event('price-update');
    window.dispatchEvent(event);
    // await CoinGecko.fetchPiesDataAndUnderlying();
  }

  static async fetchPiesDataAndUnderlying() {
    const tokens = [];
    poolsConfig.available.forEach((pieAddress) => {
      if (poolsConfig[pieAddress].coingeckoId) {
        tokens.push(poolsConfig[pieAddress].coingeckoId);
      }

      poolsConfig[pieAddress].composition.forEach((t) => {
        if (t.coingeckoId !== undefined) tokens.push(t.coingeckoId);
      });
    });

    const res = await Promise.all(tokens.map((n) => CoinGecko.fetchCoinData(n)));
    store.update((currentState) => {
      const newState = { ...currentState };
      res.forEach((data) => {
        console.log('data', data);
        newState[data.contract_address] = data;
      });
      return newState;
    });
  }

  static async fetchAssetPrices() {
    let idQueryString = 'piedao-dough-v2%2Cweth%2C';
    const idToSymbolMap = {
      'piedao-dough-v2': { address: '0xad32A8e6220741182940c5aBF610bDE99E737b2D' },
      weth: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
    };

    poolsConfig.available.forEach((pieAddress) => {
      const pie = poolsConfig[pieAddress] || null;
      if (pie.coingeckoId !== undefined) {
        idToSymbolMap[pie.coingeckoId] = poolsConfig[pieAddress];
        idToSymbolMap[pie.coingeckoId].address = pieAddress;
        idQueryString += `${pie.coingeckoId}%2C`;
      }

      pie.composition.forEach((t) => {
        if (t.coingeckoId !== undefined) {
          idToSymbolMap[t.coingeckoId] = t;
          idQueryString += `${t.coingeckoId}%2C`;
        }
      });
    });
    const baseURL = 'https://api.coingecko.com/api/v3';
    const query = `/coins/markets?ids=${idQueryString}&vs_currency=usd`;

    let prices = {};
    try {
      const response = await fetch(`${baseURL}/${query}`, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      prices = await response.json();
    } catch (err) {
      console.log('Coingecko call error. Using backup prices.');
    }

    store.update((currentState) => {
      const newState = { ...currentState };
      prices.forEach((coin) => {
        idToSymbolMap[coin.id].market_data = coin;
        newState[idToSymbolMap[coin.id].address] = idToSymbolMap[coin.id];
      });
      return newState;
    });

    return idToSymbolMap;
  }

  static fetchCoinData(coingeckoID) {
    const baseURL = 'https://api.coingecko.com/api/v3';
    return request(`${baseURL}/coins/${coingeckoID}`);
  }
}
