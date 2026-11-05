/**
 * SMS Notification Service for Deskbird
 * Uses Twilio REST API via native fetch (no external npm dependencies required).
 * If Twilio credentials are not set, it operates in simulated mode and logs to console.
 */

import { URLSearchParams } from 'node:url';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between SMS notifications per room

export class SmsService {
  constructor(options = {}) {
    this.accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID;
    this.authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = options.fromNumber || process.env.TWILIO_PHONE_NUMBER;
    this.lastSentTimes = new Map(); // roomId -> timestamp
  }

  isConfigured() {
    return Boolean(this.accountSid && this.authToken && this.fromNumber);
  }

  canSendForRoom(roomId, now = Date.now()) {
    const last = this.lastSentTimes.get(roomId) || 0;
    return now - last >= COOLDOWN_MS;
  }

  recordSent(roomId, now = Date.now()) {
    this.lastSentTimes.set(roomId, now);
  }

  /**
   * Mask a phone number for privacy, e.g. +1 555-***-1234
   */
  maskPhone(phone) {
    if (!phone) return null;
    const clean = phone.trim();
    if (clean.length < 7) return clean;
    const start = clean.slice(0, 3);
    const end = clean.slice(-4);
    return `${start} *** *** ${end}`;
  }

  /**
   * Validates international E.164 phone number format (+1234567890)
   */
  isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const clean = phone.trim();
    return /^\+[1-9]\d{6,14}$/.test(clean);
  }

  /**
   * Send an SMS message
   */
  async sendSms({ to, body, roomId = null, bypassCooldown = false }) {
    if (!this.isValidPhone(to)) {
      return { ok: false, error: 'Invalid phone number. Must include country code starting with + (e.g. +1234567890).' };
    }

    if (roomId && !bypassCooldown && !this.canSendForRoom(roomId)) {
      const remainingSec = Math.ceil((COOLDOWN_MS - (Date.now() - this.lastSentTimes.get(roomId))) / 1000);
      return { ok: false, error: `SMS notification cooldown active. Please wait ${remainingSec}s.` };
    }

    if (!this.isConfigured()) {
      console.log(`[Deskbird SMS] (SIMULATED - Twilio not configured) To: ${to} | Body: "${body}"`);
      if (roomId) this.recordSent(roomId);
      return {
        ok: true,
        simulated: true,
        message: 'SMS simulated (Twilio credentials not configured in environment).'
      };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

      const params = new URLSearchParams({
        To: to,
        From: this.fromNumber,
        Body: body
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('[Deskbird SMS] Twilio API Error:', data);
        return { ok: false, error: data.message || 'Failed to send SMS through Twilio.' };
      }

      console.log(`[Deskbird SMS] Sent SMS to ${to} (SID: ${data.sid})`);
      if (roomId) this.recordSent(roomId);
      return { ok: true, sid: data.sid };
    } catch (err) {
      console.error('[Deskbird SMS] Network Error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Send bird online alert
   */
  async sendBirdOnlineAlert(roomId, phone, formattedCode) {
    const code = formattedCode || roomId;
    const body = `Deskbird Alert: Your bird companion in room ${code} just came online! Send a message now: https://deskbird.vercel.app/#/${code}`;
    return this.sendSms({ to: phone, body, roomId });
  }

  /**
   * Send test SMS
   */
  async sendTestSms(phone, formattedCode) {
    const code = formattedCode || 'TEST';
    const body = `Deskbird Test: SMS notifications for room ${code} are working! You will be notified when your friend's bird comes online.`;
    return this.sendSms({ to: phone, body, bypassCooldown: true });
  }
}
