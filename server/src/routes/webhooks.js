import express from 'express';
import { logger } from '../utils/logger.js';
import { pollDisputes } from '../poller/disputePoller.js';

const router = express.Router();

router.post('/paypal', async (req, res) => {
  try {
    const event = req.body;
    logger.info(`[WEBHOOK] Received PayPal Webhook event: ${event?.event_type}`, {
      id: event?.id,
      summary: event?.summary
    });

    if (event?.event_type === 'CUSTOMER.DISPUTE.CREATED' || event?.event_type === 'CUSTOMER.DISPUTE.UPDATED') {
      logger.info(`Triggering poller synchronization from webhook event: ${event.event_type}`);
      // Asynchronously trigger poll
      pollDisputes().catch(err => logger.error('Error polling after webhook:', { message: err.message }));
    }

    res.status(200).json({ status: 'received' });
  } catch (err) {
    logger.error('Error processing PayPal webhook:', { message: err.message });
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;

