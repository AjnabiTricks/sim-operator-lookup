// api/lookup.js
const axios = require('axios');

// ============================================
// CREDIT: https://t.me/AZ_Tricks
// Telegram: @AZ_Tricks
// ============================================

// Session store with auto-renewal
const sessionStore = {
  cookies: null,
  lastFetched: 0,
  TTL: 8 * 60 * 1000 // 8 minutes
};

// Generate UUID v4
function generateUniqueId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Fetch fresh session from Ding
async function fetchFreshSession() {
  console.log('🔄 Fetching new session...');
  
  try {
    const response = await axios.get('https://www.ding.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    let cookieString = '';
    const cookies = response.headers['set-cookie'] || [];
    
    if (cookies.length > 0) {
      cookieString = cookies
        .map(c => c.split(';')[0])
        .filter(c => c.includes('='))
        .join('; ');
    }

    if (!cookieString) {
      const topupResponse = await axios.get('https://www.ding.com/topup?countryIso=PK', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 15000,
        maxRedirects: 5
      });

      const topupCookies = topupResponse.headers['set-cookie'] || [];
      if (topupCookies.length > 0) {
        cookieString = topupCookies
          .map(c => c.split(';')[0])
          .filter(c => c.includes('='))
          .join('; ');
      }
    }

    const requiredCookies = {
      'OptanonAlertBoxClosed': '2026-08-20T18:05:09.581Z',
      'OptanonConsent': 'isGpcEnabled=0&datestamp=Thu+Aug+20+2026+23%3A12%3A48+GMT%2B0500+(Pakistan+Standard+Time)&version=6.26.0&isIABGlobal=false&hosts=&consentId=22c86e3a-3cd4-4a72-ad8a-cf8eb0729add&interactionCount=1&landingPath=NotLandingPage&groups=C0005%3A1%2CC0002%3A1%2CC0003%3A1%2CC0001%3A1%2CC0004%3A1&geolocation=PK%3BPB&AwaitingReconsent=false',
      'moe_uuid': generateUniqueId(),
      'DeviceId': generateUniqueId(),
      'ding_ssn': 'ZW4tR0J8Lg==',
      'eze_track_session': `firstVisit=${new Date().toISOString()}|sessionsCount=1|lastVisit=${new Date().toISOString()}`
    };

    for (const [key, value] of Object.entries(requiredCookies)) {
      if (!cookieString.includes(key)) {
        cookieString += `; ${key}=${value}`;
      }
    }

    cookieString = cookieString.replace(/^; /, '');

    sessionStore.cookies = cookieString;
    sessionStore.lastFetched = Date.now();
    
    console.log('✅ Session renewed successfully');
    return cookieString;
    
  } catch (error) {
    console.error('❌ Session fetch failed:', error.message);
    
    if (sessionStore.cookies) {
      console.log('⚠️ Using existing session');
      return sessionStore.cookies;
    }
    
    const fallbackCookies = {
      'OptanonAlertBoxClosed': '2026-08-20T18:05:09.581Z',
      'OptanonConsent': 'isGpcEnabled=0&datestamp=Thu+Aug+20+2026+23%3A12%3A48+GMT%2B0500+(Pakistan+Standard+Time)&version=6.26.0&isIABGlobal=false&hosts=&consentId=22c86e3a-3cd4-4a72-ad8a-cf8eb0729add&interactionCount=1&landingPath=NotLandingPage&groups=C0005%3A1%2CC0002%3A1%2CC0003%3A1%2CC0001%3A1%2CC0004%3A1&geolocation=PK%3BPB&AwaitingReconsent=false',
      'moe_uuid': generateUniqueId(),
      'DeviceId': generateUniqueId(),
      'ding_ssn': 'ZW4tR0J8Lg=='
    };
    
    const fallbackString = Object.entries(fallbackCookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    sessionStore.cookies = fallbackString;
    sessionStore.lastFetched = Date.now();
    
    console.log('✅ Fallback session created');
    return fallbackString;
  }
}

// Get valid session with auto-renewal
async function getValidSession() {
  const now = Date.now();
  const isExpired = (now - sessionStore.lastFetched) > sessionStore.TTL;
  
  if (!sessionStore.cookies || isExpired) {
    console.log('🔄 Session expired or missing, renewing...');
    return await fetchFreshSession();
  }
  
  console.log('✅ Using cached session');
  return sessionStore.cookies;
}

// Main handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests
  if (req.method === 'GET') {
    try {
      const number = req.query.number || req.query.phoneNumber;
      if (!number) {
        return res.status(400).json({ 
          success: false, 
          error: 'Number required. Use ?number=923xxxxxxxxx',
          credit: 'https://t.me/AZ_Tricks'
        });
      }
      
      req.body = { phoneNumber: number, countryIso: req.query.country || 'PK' };
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request',
        credit: 'https://t.me/AZ_Tricks'
      });
    }
  }

  // Only allow POST or GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST or GET.',
      credit: 'https://t.me/AZ_Tricks'
    });
  }

  try {
    const { phoneNumber, countryIso = 'PK' } = req.body || req.query || {};

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'phoneNumber is required',
        credit: 'https://t.me/AZ_Tricks'
      });
    }

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid phone number format',
        credit: 'https://t.me/AZ_Tricks'
      });
    }

    console.log(`📞 Looking up: ${cleanNumber} (${countryIso})`);

    let cookieString;
    let retries = 3;
    
    while (retries > 0) {
      try {
        cookieString = await getValidSession();
        break;
      } catch (error) {
        retries--;
        console.log(`⚠️ Session fetch failed, retries left: ${retries}`);
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (!cookieString) {
      throw new Error('Unable to establish session after retries');
    }

    const payload = {
      phoneNumber: cleanNumber,
      selectedCountryIso: countryIso,
      uniqueId: generateUniqueId()
    };

    console.log('📤 Sending request to Ding...');

    const response = await axios.post(
      'https://api-v2.www.ding.com/api/operatorlookup',
      payload,
      {
        headers: {
          'Host': 'api-v2.www.ding.com',
          'Content-Type': 'text/plain;charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Origin': 'https://www.ding.com',
          'Referer': `https://www.ding.com/topup?countryIso=${countryIso}`,
          'Cookie': cookieString,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Ch-Ua': '"Not;A=Brand";v="8", "Chromium";v="150"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Site': 'same-site',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'Priority': 'u=1, i'
        },
        timeout: 15000
      }
    );

    console.log('✅ API call successful');

    // Extract only operator details
    const operatorData = response.data.operators && response.data.operators[0];
    const normalizedData = response.data.normalizedPhoneNumber;

    // Clean response - only operator details with credit
    const cleanResponse = {
      success: true,
      operator: {
        name: operatorData?.name || 'Unknown',
        code: operatorData?.operatorCode || 'N/A',
        id: operatorData?.operatorId || 'N/A',
        country: operatorData?.countryIso || countryIso,
        confidence: response.data.confidence || 'Unknown'
      },
      number: {
        original: cleanNumber,
        formatted: normalizedData?.internationalFormattedNumber || cleanNumber,
        country: normalizedData?.countryIso || countryIso
      },
      credit: {
        channel: 'https://t.me/AZ_Tricks',
        telegram: '@AZ_Tricks',
        message: 'Developed by AZ_Tricks'
      }
    };

    return res.status(200).json(cleanResponse);

  } catch (error) {
    console.error('🔥 API Error:', error.message);
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('🔄 Session expired, clearing cache...');
      sessionStore.cookies = null;
      sessionStore.lastFetched = 0;
      
      return res.status(401).json({
        success: false,
        error: 'Session expired',
        retry: true,
        credit: 'https://t.me/AZ_Tricks'
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: 60,
        credit: 'https://t.me/AZ_Tricks'
      });
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      error: error.message || 'Failed to lookup operator',
      credit: 'https://t.me/AZ_Tricks'
    });
  }
};
