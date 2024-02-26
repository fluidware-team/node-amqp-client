/*
 * Copyright Fluidware srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import { cleanUpDocker, rabbitmq_password, rabbitmq_user, startDocker } from './testUtils';
import { BrokerFactory, Consumer, Producer } from '../src';
import { setTimeout } from 'timers/promises';

describe('single rabbitmq', () => {
  jest.setTimeout(10000);
  beforeAll(async () => {
    startDocker('single');
    await setTimeout(5000);
  });
  afterAll(() => {
    cleanUpDocker('single');
  });
  describe('create a publisher a consumer', () => {
    let publisher: Producer;
    let consumer: Consumer;
    beforeEach(async () => {
      publisher = await BrokerFactory.getProducer({
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`]
      });
      await publisher.connect();
      consumer = await BrokerFactory.getConsumer({
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`]
      });
      await consumer.connect();
    });
    afterEach(async () => {
      await publisher.disconnect();
      await consumer.disconnect();
    });
    it('publisher send 1 message', done => {
      consumer
        .subscribe(
          'test-queue',
          async msg => {
            if (!msg) {
              return done(new Error('no message received'));
            }
            assert.strictEqual(msg.content.toString(), 'test message');
            done();
          },
          true
        )
        .catch(e => {
          done(e);
        });
      publisher.sendToQueue('test-queue', Buffer.from('test message'));
    });
    it('publisher send 2 messages', done => {
      let count = 0;
      const expected = 2;
      consumer
        .subscribe(
          'test-queue',
          async msg => {
            if (!msg) {
              return done(new Error('no message received'));
            }
            assert.strictEqual(msg.content.toString(), `test message ${count + 1}`);
            count++;
            if (count === expected) {
              done();
            }
          },
          true
        )
        .catch(e => {
          done(e);
        });
      publisher.sendToQueue('test-queue', Buffer.from('test message 1'));
      publisher.sendToQueue('test-queue', Buffer.from('test message 2'));
    });
  });
  describe('create a publisher and 2 consumers (direct queue)', () => {
    let publisher: Producer;
    let consumerA: Consumer;
    let consumerB: Consumer;
    beforeEach(async () => {
      publisher = await BrokerFactory.getProducer({
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`]
      });
      await publisher.connect();
      consumerA = await BrokerFactory.getConsumer('a', {
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`],
        clientId: 'a'
      });
      await consumerA.connect(1);
      consumerB = await BrokerFactory.getConsumer('b', {
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`],
        clientId: 'b'
      });
      await consumerB.connect(1);
    });
    afterEach(async () => {
      // await setTimeout(50000);
      await publisher.disconnect();
      await consumerA.disconnect();
      await consumerB.disconnect();
    });
    it('publisher send multiple messages', done => {
      let count = 0;
      const expected = 20;
      consumerA
        .subscribe(
          'test-queue',
          async (msg, ackOrNack) => {
            if (!msg) {
              return done(new Error('no message received'));
            }
            ackOrNack();
            assert.strictEqual(msg.content.toString(), `test message ${count + 1}`);
            count++;
            if (count === expected) {
              done();
            }
          },
          false
        )
        .catch(e => {
          done(e);
        });
      consumerB
        .subscribe(
          'test-queue',
          async (msg, ackOrNack) => {
            if (!msg) {
              return done(new Error('no message received'));
            }
            ackOrNack();
            assert.strictEqual(msg.content.toString(), `test message ${count + 1}`);
            count++;
            if (count === expected) {
              done();
            }
          },
          false
        )
        .catch(e => {
          done(e);
        });
      for (let i = 0; i < expected; i++) {
        publisher.sendToQueue('test-queue', Buffer.from(`test message ${i + 1}`));
      }
    });
  });
  describe('create a publisher and 2 consumers (fanout exchange)', () => {
    let publisher: Producer;
    let consumerA: Consumer;
    let consumerB: Consumer;
    beforeEach(async () => {
      publisher = await BrokerFactory.getProducer({
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`]
      });
      await publisher.connect();
      consumerA = await BrokerFactory.getConsumer('a', {
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`],
        clientId: 'a'
      });
      await consumerA.connect(1);
      consumerB = await BrokerFactory.getConsumer('b', {
        brokers: [`amqp://${rabbitmq_user}:${rabbitmq_password}@127.0.0.1:5672/`],
        clientId: 'b'
      });
      await consumerB.connect(1);
    });
    afterEach(async () => {
      // await setTimeout(50000);
      await publisher.disconnect();
      await consumerA.disconnect();
      await consumerB.disconnect();
    });
    it('publisher send multiple messages', done => {
      let countA = 0;
      let countB = 0;
      const expected = 20;
      consumerA
        .subscribeToFanoutExchange(
          'test-fanout-exchange',
          async (msg, ackOrNack) => {
            if (!msg) {
              return done(new Error('no message received'));
            }
            ackOrNack();
            assert.strictEqual(msg.content.toString(), `test message ${countA + 1}`);
            countA++;
            if (countA >= expected && countB >= expected) {
              done();
            }
          },
          false
        )
        .catch(e => {
          done(e);
        });
      consumerB
        .subscribeToFanoutExchange(
          'test-fanout-exchange',
          async (msg, ackOrNack) => {
            if (!msg) {
              return done(new Error('no message received'));
            }
            ackOrNack();
            assert.strictEqual(msg.content.toString(), `test message ${countB + 1}`);
            countB++;
            if (countA >= expected && countB >= expected) {
              done();
            }
          },
          false
        )
        .catch(e => {
          done(e);
        });
      // wait 1 second before sending messages
      setTimeout(1000).then(() => {
        for (let i = 0; i < expected; i++) {
          publisher.publish(
            { exchange: 'test-fanout-exchange', exchangeType: 'fanout' },
            Buffer.from(`test message ${i + 1}`)
          );
        }
      });
    });
  });
});
