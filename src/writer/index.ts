import { Channel, ConsumeMessage } from 'amqplib';
import { AmqpConnectionManager, ChannelWrapper, Options } from 'amqp-connection-manager';
import { getLogger } from '@fluidware-it/saddlebag';
import { Logger } from 'pino';

const exchangesQueuesInitiated: { [queue: string]: boolean } = {};

export class RabbitWriter {
  channel: ChannelWrapper | null = null;
  connection: AmqpConnectionManager;
  logger: Logger;

  constructor(connection: AmqpConnectionManager) {
    this.connection = connection;
    this.logger = getLogger();
  }

  initQueue = async (exchangeName: string, queueName: string, onSetup?: (err?: Error) => void) => {
    if (!exchangeName) {
      throw new Error('Missing required exchangeName arg');
    }
    if (!queueName) {
      throw new Error('Missing required queueName arg');
    }
    if (!this.channel) {
      this.logger.info('opening channel');
      this.channel = this.connection.createChannel();
    }
    if (exchangesQueuesInitiated[`${exchangeName}_${queueName}`]) {
      return;
    }
    this.logger.info(`initQueue for ${exchangeName} -> ${queueName}`);
    const logger = this.logger;
    try {
      await this.channel.addSetup((channel: Channel) => {
        logger.info(`addSetup ${exchangeName} -> ${queueName}`);
        return Promise.all([
          channel.assertExchange(exchangeName, 'direct', {
            durable: true
          }),
          channel.assertQueue(queueName, {
            durable: true,
            exclusive: false
          }),
          channel.bindQueue(queueName, exchangeName, '')
        ]);
      });
      exchangesQueuesInitiated[`${exchangeName}_${queueName}`] = true;
      await this.sendToQueue(queueName, { action: 'ping' }, { expiration: '10' });
      if (onSetup) {
        onSetup();
      }
    } catch (e) {
      this.logger.error(`failed to initialized exchange/queue ${queueName}: ${e.message}`);
      if (onSetup) {
        onSetup(e);
      }
    }
  };

  initFanoutExchange = async (
    exchangeName: string,
    enableSinglePrefetch = false,
    messageCallback?: (msg: ConsumeMessage | null, channel: Channel) => Promise<void>,
    noAck = false
  ) => {
    if (!exchangeName) {
      throw new Error('Missing required exchangeName arg');
    }
    if (!this.channel) {
      this.logger.info('opening channel');
      this.channel = this.connection.createChannel();
    }
    this.logger.info(`initFanoutExchange for ${exchangeName}`);
    const logger = this.logger;
    try {
      await this.channel.addSetup(async (channel: Channel) => {
        if (enableSinglePrefetch) {
          logger.info(`addSetup ${exchangeName} -> set prefetch 1`);
          await channel.prefetch(1);
        }

        logger.info(`addSetup ${exchangeName}`);
        await channel.assertExchange(exchangeName, 'fanout', {
          durable: true
        });
        const assertQueueResult = await channel.assertQueue('', {
          durable: false,
          exclusive: true
        });
        await channel.bindQueue(assertQueueResult.queue, exchangeName, '');
        if (messageCallback) {
          if (enableSinglePrefetch) noAck = false;
          logger.info(`addSetup ${exchangeName} -> consume`);
          await channel.consume(
            assertQueueResult.queue,
            async (msg: ConsumeMessage | null) => {
              await messageCallback(msg, channel);
            },
            { noAck }
          );
        }
      });
    } catch (e) {
      this.logger.error(`failed to initialized exchange ${exchangeName}: ${e.message}`);
      throw e;
    }
  };

  sendToQueue = async (queueName: string, payload: string | Buffer | object, options?: Options.Publish) => {
    if (!this.channel) {
      this.logger.info('opening channel');
      this.channel = this.connection.createChannel();
    }
    if (!(payload instanceof Buffer)) {
      if (typeof payload === 'string') {
        payload = Buffer.from(payload);
      } else {
        payload = Buffer.from(JSON.stringify(payload));
      }
    }
    return this.channel.sendToQueue(queueName, payload, options);
  };

  publishToExchange = async (
    exchangeName: string,
    payload: string | Buffer | object,
    routingKey?: string,
    options?: Options.Publish
  ) => {
    if (!this.channel) {
      this.logger.info('opening channel');
      this.channel = this.connection.createChannel();
    }
    if (!(payload instanceof Buffer)) {
      if (typeof payload === 'string') {
        payload = Buffer.from(payload);
      } else {
        payload = Buffer.from(JSON.stringify(payload));
      }
    }
    return this.channel.publish(exchangeName, routingKey ?? '', payload, options);
  };

  closeChannel = async () => {
    await this.channel?.close();
    this.channel = null;
  };
}
