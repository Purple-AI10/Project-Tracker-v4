
// To deploy this function, run in Supabase CLI:
// supabase functions deploy process-emails

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    // Get queued emails
    const { data: emails, error } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'queued')
      .limit(10)

    if (error) {
      throw error
    }

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ message: 'No emails to process' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let processedCount = 0

    for (const email of emails) {
      try {
        // Mark as processing
        await supabase
          .from('email_queue')
          .update({ status: 'processing' })
          .eq('id', email.id)

        // Call the send-email function
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: email.recipient_email,
            subject: email.subject,
            html: email.body,
            provider: 'resend' // or 'sendgrid'
          })
        })

        if (emailResponse.ok) {
          // Mark as sent
          await supabase
            .from('email_queue')
            .update({ 
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('id', email.id)
          
          processedCount++
        } else {
          // Mark as failed
          await supabase
            .from('email_queue')
            .update({ status: 'failed' })
            .eq('id', email.id)
        }
      } catch (emailError) {
        console.error(`Failed to process email ${email.id}:`, emailError)
        
        // Mark as failed
        await supabase
          .from('email_queue')
          .update({ status: 'failed' })
          .eq('id', email.id)
      }
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${processedCount} emails successfully` 
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error processing emails:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
