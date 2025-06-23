
// To deploy this function, run in Supabase CLI:
// supabase functions deploy send-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')

interface EmailRequest {
  to: string
  subject: string
  html: string
  text?: string
  provider?: 'resend' | 'sendgrid'
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { to, subject, html, text, provider = 'resend' }: EmailRequest = await req.json()

    if (!to || !subject || !html) {
      return new Response('Missing required fields', { status: 400 })
    }

    let result
    
    if (provider === 'resend' && RESEND_API_KEY) {
      result = await sendWithResend(to, subject, html, text)
    } else if (provider === 'sendgrid' && SENDGRID_API_KEY) {
      result = await sendWithSendGrid(to, subject, html, text)
    } else {
      return new Response('No email provider configured', { status: 500 })
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  } catch (error) {
    console.error('Email sending error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

async function sendWithResend(to: string, subject: string, html: string, text?: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'projects@mikroindia.com',
      to: [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    })
  })

  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(`Resend API error: ${result.message}`)
  }

  return { success: true, messageId: result.id, provider: 'resend' }
}

async function sendWithSendGrid(to: string, subject: string, html: string, text?: string) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: to }]
      }],
      from: { email: 'projects@mikroindia.com' },
      subject,
      content: [
        { type: 'text/html', value: html },
        { type: 'text/plain', value: text || html.replace(/<[^>]*>/g, '') }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`SendGrid API error: ${error}`)
  }

  return { success: true, messageId: response.headers.get('x-message-id'), provider: 'sendgrid' }
}
