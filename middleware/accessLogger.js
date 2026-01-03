const AccessLog = require('../models/AccessLog');

async function logAccess(req, res, next) {
  try {
    // Get IP address (handles proxy headers too)
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               req.ip;
    
    // Get Cloudflare Access user email from headers
    // Cloudflare Access passes this in 'cf-access-authenticated-user-email' header
    const cloudflareEmail = req.headers['cf-access-authenticated-user-email'] || null;
    
    const accessLog = new AccessLog({
      ip: ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'] || 'Unknown',
      cloudflareEmail: cloudflareEmail,
      timestamp: new Date()
    });
    
    await accessLog.save();
    
    // Log to console as well
    const userInfo = cloudflareEmail ? ` [User: ${cloudflareEmail}]` : '';
    console.log(`[ACCESS] ${ip}${userInfo} - ${req.method} ${req.path} - ${req.headers['user-agent']?.substring(0, 50) || 'Unknown'}`);
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Error logging access:', error.message);
  }
  
  next();
}

module.exports = { logAccess };
