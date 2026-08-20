// api/lookup.js
const axios = require('axios');

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
    const response = await axios.get('https://www.ding.com/topup?countryIso=PK', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 16; SM-A065F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.181 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    // Extract cookies
    const cookies = response.headers['set-cookie'] || [];
    let cookieString = cookies
      .map(c => c.split(';')[0])
      .filter(c => c.includes('='))
      .join('; ');

    // Add required cookies if missing
    if (!cookieString.includes('OptanonAlertBoxClosed')) {
      cookieString += '; OptanonAlertBoxClosed=2026-08-20T18:05:09.581Z';
    }
    if (!cookieString.includes('moe_uuid')) {
      cookieString += `; moe_uuid=${generateUniqueId()}`;
    }
    if (!cookieString.includes('DeviceId')) {
      cookieString += `; DeviceId=${generateUniqueId()}`;
    }

    // Update store
    sessionStore.cookies = cookieString;
    sessionStore.lastFetched = Date.now();
    
    console.log('✅ Session renewed successfully');
    return cookieString;
    
  } catch (error) {
    console.error('❌ Session fetch failed:', error.message);
    if (sessionStore.cookies) {
      console.log('⚠️ Using stale session');
      return sessionStore.cookies;
    }
    throw new Error('Unable to establish session');
  }
}

// Get valid session with auto-renewal
async function getValidSession() {
  const now = Date.now();
  const isExpired = (now - sessionStore.lastFetched) > sessionStore.TTL;
  
  if (!sessionStore.cookies || isExpired) {
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

  // Handle GET requests (for easy testing)
  if (req.method === 'GET') {
    try {
      const number = req.query.number || req.query.phoneNumber;
      if (!number) {
        return res.status(400).json({ 
          success: false, 
          error: 'Number required. Use ?number=923xxxxxxxxx' 
        });
      }
      
      // Call POST logic with number
      req.body = { phoneNumber: number, countryIso: req.query.country || 'PK' };
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
  }

  // Only allow POST (or GET after conversion)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST or GET.' 
    });
  }

  try {
    // Parse body
    const { phoneNumber, countryIso = 'PK' } = req.body || req.query || {};

    // Validation
    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'phoneNumber is required' 
      });
    }

    // Clean phone number
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid phone number format' 
      });
    }

    console.log(`📞 Looking up: ${cleanNumber} (${countryIso})`);

    // Get session (auto-renewal handled here)
    const cookieString = await getValidSession();

    // Prepare request
    const payload = {
      phoneNumber: cleanNumber,
      selectedCountryIso: countryIso,
      uniqueId: generateUniqueId()
    };

    // Make API call
    const response = await axios.post(
      'https://api-v2.www.ding.com/api/operatorlookup',
      payload,
      {
        headers: {
          'Host': 'api-v2.www.ding.com',
          'Content-Type': 'text/plain;charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 16; SM-A065F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.181 Mobile Safari/537.36',
          'Accept': '*/*',
          'Origin': 'https://www.ding.com',
          'Referer': `https://www.ding.com/topup?countryIso=${countryIso}`,
          'Cookie': cookieString,
          'X-Requested-With': 'mark.via.gp',
          'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Ch-Ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Android WebView";v="150"',
          'Sec-Ch-Ua-Mobile': '?1',
          'Sec-Ch-Ua-Platform': '"Android"',
          'Sec-Fetch-Site': 'same-site',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'Priority': 'u=1, i'
        },
        timeout: 15000
      }
    );

    // Success response
    return res.status(200).json({
      success: true,
      data: response.data,
      meta: {
        phoneNumber: cleanNumber,
        country: countryIso,
        sessionRenewed: (Date.now() - sessionStore.lastFetched) < 5000,
        sessionAge: Math.round((Date.now() - sessionStore.lastFetched) / 1000)
      }
    });

  } catch (error) {
    console.error('🔥 API Error:', error.message);
    
    // Handle session expiration
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('🔄 Session expired, clearing cache...');
      sessionStore.cookies = null;
      sessionStore.lastFetched = 0;
      
      return res.status(401).json({
        success: false,
        error: 'Session expired',
        retry: true,
        message: 'Please retry the request'
      });
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: 60,
        message: 'Please wait before retrying'
      });
    }

    // Generic error
    return res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status || 500,
      message: 'Failed to lookup operator'
    });
  }
};
