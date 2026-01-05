import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';
import crypto from 'crypto';

// Paypack credentials
const PAYPACK_CONFIG = {
  applicationId: 'ed4418b4-a442-11f0-ab8f-deadd43720af',
  applicationSecret: '70d66ff14de62d51762d342ee05017aeda39a3ee5e6b4b0d3255bfef95601890afd80709',
  webhookSecret: 'Af9Ep3fa5K0ASQeGcalW7uRo6VzJCKzlQPx2PJrPTk5jEuP5EE',
  baseUrl: 'https://paypack.rw'
};

// Paypack API endpoints - trying different variations
const PAYPACK_ENDPOINTS = {
  createPayment: '/api/v1/payments', // Most common format
  createPaymentAlt: '/api/payments/create',
  createPaymentAlt2: '/api/transactions',
  createPaymentAlt3: '/payments'
};

// Bank account details for Bank Transfer
const BANK_ACCOUNTS = {
  RWF: {
    accountNumber: '100220664858',
    bankName: 'Bank of Kigali',
    currency: 'RWF'
  },
  USD: {
    accountNumber: '100220665237',
    bankName: 'Bank of Kigali',
    currency: 'USD'
  }
};

// Plan configurations
const PLANS = {
  professional: {
    name: 'Professional',
    monthlyPrice: 99000,
    annualPrice: 79000,
    features: ['Up to 10 participants', '4-hour meeting duration', 'HD video quality', 'Basic AI transcription']
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 249000,
    annualPrice: 199000,
    features: ['Up to 50 participants', 'Unlimited meeting duration', '4K video quality', 'Advanced AI insights']
  },
  executive: {
    name: 'Executive',
    monthlyPrice: 499000,
    annualPrice: 399000,
    features: ['Unlimited participants', 'Unlimited meeting duration', '4K video with premium bandwidth', 'Full AI suite']
  }
};

export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Payment creation request received:', req.body);
    const { planType, billingCycle, paymentMethod, currency = 'RWF' } = req.body;
    const userId = req.userId;
    
    console.log('User ID:', userId, 'Plan Type:', planType, 'Billing Cycle:', billingCycle, 'Payment Method:', paymentMethod);

    // Check authentication
    if (!userId) {
      console.error('No userId found in request - authentication failed');
      return res.status(401).json({ message: 'Unauthorized - Please sign in to continue' });
    }

    if (!planType || !billingCycle) {
      return res.status(400).json({ message: 'Plan type and billing cycle are required' });
    }

    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }

    // Validate payment method
    const validMethods = ['momo', 'airtel', 'bank_transfer'];
    if (!validMethods.includes(paymentMethod.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid payment method. Must be momo, airtel, or bank_transfer' });
    }

    const plan = PLANS[planType as keyof typeof PLANS];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan type' });
    }

    const amount = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
    const paymentId = crypto.randomUUID();
    const paymentMethodLower = paymentMethod.toLowerCase();

    // Create payment record in database
    let payment;
    try {
      payment = await prisma.payment.create({
        data: {
          id: paymentId,
          userId,
          planType,
          billingCycle,
          amount,
          status: 'PENDING',
          currency: currency
        }
      });
      console.log('Payment record created successfully:', paymentId);
    } catch (dbError) {
      console.error('Database error creating payment:', dbError);
      return res.status(500).json({ 
        message: 'Failed to create payment record',
        error: dbError instanceof Error ? dbError.message : 'Database error'
      });
    }

    // Handle Bank Transfer (not supported by Paypack)
    if (paymentMethodLower === 'bank_transfer') {
      const bankAccount = BANK_ACCOUNTS[currency as keyof typeof BANK_ACCOUNTS] || BANK_ACCOUNTS.RWF;
      
      return res.json({
        paymentId,
        paymentMethod: 'bank_transfer',
        amount,
        currency,
        plan: plan.name,
        billingCycle,
        bankAccount: {
          accountNumber: bankAccount.accountNumber,
          bankName: bankAccount.bankName,
          currency: bankAccount.currency
        },
        instructions: `Please transfer ${currency} ${amount.toLocaleString()} to the following account:\n\nBank: ${bankAccount.bankName}\nAccount Number: ${bankAccount.accountNumber}\nReference: ${paymentId}\n\nAfter payment, your subscription will be activated within 24 hours.`
      });
    }

    // Handle MoMo and Airtel through Paypack
    // Map payment method to Paypack format
    const paypackMethod = paymentMethodLower === 'momo' ? 'momo' : 'airtel';

    // Prepare Paypack payment data
    // Note: Paypack API format may vary - trying common formats
    const paymentData = {
      application_id: PAYPACK_CONFIG.applicationId,
      amount: amount,
      currency: currency,
      reference: paymentId,
      description: `IRU Board ${plan.name} Plan - ${billingCycle}`,
      method: paypackMethod, // Payment method: 'momo' or 'airtel'
      callback_url: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/payment/cancel`,
      webhook_url: `${process.env.BACKEND_URL || 'http://iru-board-be-production.up.railway.app'}/api/auth/payment/webhook`
    };

    // Create signature for Paypack (HMAC SHA256)
    // Some APIs require sorted keys for signature generation
    const sortedKeys = Object.keys(paymentData).sort();
    const signatureString = sortedKeys.map(key => `${key}=${paymentData[key as keyof typeof paymentData]}`).join('&');
    
    const signature = crypto
      .createHmac('sha256', PAYPACK_CONFIG.applicationSecret)
      .update(signatureString)
      .digest('hex');

    const paypackRequest = {
      ...paymentData,
      signature
    };

    // Make request to Paypack
    let paypackData;
    let lastError: Error | null = null;
    
    // Try different endpoint variations
    const endpointsToTry = [
      PAYPACK_ENDPOINTS.createPayment,
      PAYPACK_ENDPOINTS.createPaymentAlt,
      PAYPACK_ENDPOINTS.createPaymentAlt2,
      PAYPACK_ENDPOINTS.createPaymentAlt3,
      '/api/payments' // Original endpoint as fallback
    ];
    
    for (const endpoint of endpointsToTry) {
      try {
        const fullUrl = `${PAYPACK_CONFIG.baseUrl}${endpoint}`;
        console.log(`Trying Paypack endpoint: ${fullUrl}`);
        console.log('Paypack request data:', JSON.stringify(paypackRequest, null, 2));
        
        const paypackResponse = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PAYPACK_CONFIG.applicationSecret}`,
            'X-Application-Id': PAYPACK_CONFIG.applicationId
          },
          body: JSON.stringify(paypackRequest)
        });

        console.log(`Paypack response status for ${endpoint}:`, paypackResponse.status);
        console.log('Paypack response headers:', Object.fromEntries(paypackResponse.headers.entries()));

        // If 404, try next endpoint
        if (paypackResponse.status === 404) {
          console.log(`Endpoint ${endpoint} returned 404, trying next...`);
          lastError = new Error(`Endpoint ${endpoint} not found (404)`);
          continue;
        }

        // Check if response is JSON
        const contentType = paypackResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const textResponse = await paypackResponse.text();
          console.log('Paypack non-JSON response:', textResponse);
          
          // If it's still 404, try next endpoint
          if (paypackResponse.status === 404) {
            lastError = new Error(`Endpoint ${endpoint} returned: ${textResponse.substring(0, 100)}`);
            continue;
          }
          
          throw new Error(`Paypack API returned non-JSON response: ${textResponse.substring(0, 200)}`);
        }

        paypackData = await paypackResponse.json();
        console.log('Paypack response data:', paypackData);

        // Check if Paypack returned an error
        if (!paypackResponse.ok) {
          // If it's a 404, try next endpoint
          if (paypackResponse.status === 404) {
            lastError = new Error(paypackData.message || paypackData.error || `Paypack API error: ${paypackResponse.status}`);
            continue;
          }
          throw new Error(paypackData.message || paypackData.error || `Paypack API error: ${paypackResponse.status}`);
        }

        // Validate that we got a payment URL
        if (!paypackData.payment_url && !paypackData.paymentUrl) {
          throw new Error('Paypack did not return a payment URL');
        }

        // Success! Break out of the loop
        console.log(`✅ Successfully connected to Paypack using endpoint: ${endpoint}`);
        break;
      } catch (endpointError) {
        // If it's a 404 or network error, try next endpoint
        if (endpointError instanceof Error && (endpointError.message.includes('404') || endpointError.message.includes('not found'))) {
          lastError = endpointError;
          console.log(`Endpoint ${endpoint} failed, trying next...`);
          continue;
        }
        // For other errors, throw immediately
        throw endpointError;
      }
    }

    // If we tried all endpoints and none worked
    if (!paypackData) {
      const errorMessage = lastError?.message || 'All Paypack endpoints failed';
      console.error('All Paypack endpoints failed. Last error:', errorMessage);
      console.error('Tried endpoints:', endpointsToTry);
      console.error('Paypack base URL:', PAYPACK_CONFIG.baseUrl);
      
      // Update payment status to failed
      await prisma.payment.update({
        where: { id: paymentId },
        data: { 
          status: 'FAILED', 
          errorMessage: `Paypack API endpoint not found. Tried: ${endpointsToTry.join(', ')}`
        }
      });

      return res.status(500).json({ 
        message: 'Paypack API endpoint not found (404)',
        error: `Tried ${endpointsToTry.length} endpoints: ${endpointsToTry.join(', ')}`,
        details: 'Please check Paypack API documentation at https://paypack.rw or contact Paypack support for the correct endpoint URL.'
      });
    }

    // Check if payment creation was successful
    if (paypackData.status === 'FAILED' || paypackData.error) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', errorMessage: paypackData.message || paypackData.error }
      });
      return res.status(400).json({ 
        message: 'Payment creation failed', 
        error: paypackData.message || paypackData.error 
      });
    }

    // Get payment URL (Paypack might return it as payment_url or paymentUrl)
    const paymentUrl = paypackData.payment_url || paypackData.paymentUrl;
    const transactionId = paypackData.transaction_id || paypackData.transactionId;

    if (!paymentUrl) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', errorMessage: 'Paypack did not return a payment URL' }
      });
      return res.status(500).json({ 
        message: 'Payment creation failed',
        error: 'Paypack did not return a valid payment URL'
      });
    }

    // Update payment with Paypack transaction ID
    await prisma.payment.update({
      where: { id: paymentId },
      data: { 
        paypackTransactionId: transactionId,
        paypackPaymentUrl: paymentUrl
      }
    });

    res.json({
      paymentId,
      paymentUrl: paymentUrl,
      paymentMethod: paymentMethodLower,
      amount,
      currency,
      plan: plan.name,
      billingCycle,
      transactionId: transactionId
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      name: error instanceof Error ? error.name : 'Unknown',
      body: req.body,
      userId: (req as any).userId
    });
    
    // Try to clean up any created payment record if it exists
    if (req.body && typeof req.body === 'object') {
      // Payment ID would be in the error context if it was created
    }
    
    res.status(500).json({ 
      message: 'Internal server error', 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
};

export const verifyPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { paymentId } = req.body;
    const userId = req.userId;

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, userId }
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify with Paypack
    const paypackResponse = await fetch(`${PAYPACK_CONFIG.baseUrl}/payments/${payment.paypackTransactionId}`, {
      headers: {
        'Authorization': `Bearer ${PAYPACK_CONFIG.applicationSecret}`
      }
    });

    const paypackData = await paypackResponse.json();

    if (paypackData.status === 'COMPLETED') {
      // Update payment status
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'COMPLETED' }
      });

      // Create or update subscription
      const subscription = await prisma.subscription.upsert({
        where: { userId },
        update: {
          planType: payment.planType,
          billingCycle: payment.billingCycle,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
        },
        create: {
          userId,
          planType: payment.planType,
          billingCycle: payment.billingCycle,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
        }
      });

      res.json({ 
        success: true, 
        subscription,
        message: 'Payment verified successfully' 
      });
    } else {
      res.json({ 
        success: false, 
        status: paypackData.status,
        message: 'Payment not completed' 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getSubscriptions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true
          }
        }
      }
    });

    // Get all payments for the user
    const payments = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        planType: true,
        billingCycle: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Calculate statistics
    const totalPayments = payments.length;
    const completedPayments = payments.filter(p => p.status === 'COMPLETED').length;
    const totalSpent = payments
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate next billing date
    let nextBillingDate = null;
    if (subscription && subscription.status === 'ACTIVE') {
      nextBillingDate = subscription.currentPeriodEnd;
    }

    // Calculate days until renewal
    let daysUntilRenewal = null;
    if (nextBillingDate) {
      const now = new Date();
      const renewal = new Date(nextBillingDate);
      const diffTime = renewal.getTime() - now.getTime();
      daysUntilRenewal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Get payment history with more details
    const paymentHistory = payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      planType: payment.planType,
      billingCycle: payment.billingCycle,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    }));

    res.json({ 
      subscription: subscription ? {
        id: subscription.id,
        planType: subscription.planType,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelledAt: subscription.cancelledAt,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      } : null,
      payments: paymentHistory,
      statistics: {
        totalPayments,
        completedPayments,
        totalSpent,
        nextBillingDate,
        daysUntilRenewal
      }
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const cancelSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    await prisma.subscription.update({
      where: { userId },
      data: { 
        status: 'CANCELLED',
        cancelledAt: new Date()
      }
    });

    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Webhook handler for Paypack
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-paypack-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', PAYPACK_CONFIG.webhookSecret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const { reference, status, transaction_id } = req.body;

    if (status === 'COMPLETED') {
      // Update payment status
      await prisma.payment.update({
        where: { id: reference },
        data: { status: 'COMPLETED' }
      });

      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: reference }
      });

      if (payment) {
        // Create or update subscription
        await prisma.subscription.upsert({
          where: { userId: payment.userId },
          update: {
            planType: payment.planType,
            billingCycle: payment.billingCycle,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
          },
          create: {
            userId: payment.userId,
            planType: payment.planType,
            billingCycle: payment.billingCycle,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
          }
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};
