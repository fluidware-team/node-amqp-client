import { AmqpConfig, Consumer, Producer } from './interface';
import { AmqpProducer, AmqpConsumer } from './amqp';
import { getAmqpConfig } from './config';
import { getMd5 } from '@fluidware-it/saddlebag';

export class BrokerFactory {
  private static amqp: { producer: Record<string, AmqpProducer>; consumer: Record<string, AmqpConsumer> } = {
    producer: {},
    consumer: {}
  };

  private static getConfig(code?: string | AmqpConfig): { code: string; config: AmqpConfig } {
    let _config: AmqpConfig;
    let _code: string;
    if (!code) {
      _code = '_default_';
      _config = getAmqpConfig();
    } else if (typeof code === 'string') {
      _code = code;
      _config = getAmqpConfig(code);
    } else {
      _config = code;
      _code = getMd5(JSON.stringify(code));
    }
    return { code: _code, config: _config };
  }

  static async getProducer(code?: string | AmqpConfig): Promise<Producer> {
    const { code: _code, config: _config } = BrokerFactory.getConfig(code);
    if (!BrokerFactory.amqp.producer[_code]) {
      BrokerFactory.amqp.producer[_code] = new AmqpProducer(_config);
      await BrokerFactory.amqp.producer[_code].connect();
      process.once('SIGINT', async () => {
        await BrokerFactory.amqp.producer[_code].disconnect();
      });
      process.once('SIGTERM', async () => {
        await BrokerFactory.amqp.producer[_code].disconnect();
      });
    }
    return BrokerFactory.amqp.producer[_code];
  }

  static async getConsumer(code?: string | AmqpConfig, config?: AmqpConfig): Promise<Consumer> {
    let _code: string;
    let _config: AmqpConfig;
    if (code && typeof code === 'string' && config) {
      _code = code;
      _config = config;
    } else {
      const ret = BrokerFactory.getConfig(code);
      _code = ret.code;
      _config = ret.config;
    }
    if (!BrokerFactory.amqp.consumer[_code]) {
      BrokerFactory.amqp.consumer[_code] = new AmqpConsumer(_config);
      await BrokerFactory.amqp.consumer[_code].connect();
      process.once('SIGINT', async () => {
        await BrokerFactory.amqp.consumer[_code].disconnect();
      });
      process.once('SIGTERM', async () => {
        await BrokerFactory.amqp.consumer[_code].disconnect();
      });
    }
    return BrokerFactory.amqp.consumer[_code];
  }
}
