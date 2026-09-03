import { connect, AmqpConnectionManager } from 'amqp-connection-manager';
import { getLogger } from '@fluidware-it/saddlebag';
import { buildBrokerURIs, getConnectionName } from '../config';

const brokerURI: string[] = [];

const BROKER_MAX_CONNECTION_ERRORS = 4;

function checkBrokerEnv() {
  brokerURI.length = 0;
  brokerURI.push(...buildBrokerURIs());
  return brokerURI;
}

async function getBrokerConnection(): Promise<AmqpConnectionManager> {
  if (brokerURI.length === 0) {
    throw new Error('missing brokerURI, have you called checkBrokerEnv()?');
  }

  const logger = getLogger().child({ component: 'amplib' });
  let brokerConnectionErrors = 0;
  let isFunctionReturned = false;
  logger.debug('connecting');

  return new Promise((resolve, reject) => {
    const connection = connect(brokerURI, {
      connectionOptions: {
        clientProperties: {
          connection_name: getConnectionName()
        }
      }
    });

    connection.on('connect', () => {
      logger.info('broker connected');
      brokerConnectionErrors = 0;

      if (!isFunctionReturned) {
        resolve(connection);
        isFunctionReturned = true;
      }
    });

    connection.on('connectFailed', err => {
      brokerConnectionErrors++;
      logger.error(
        { error_message: err.err?.message || 'Unknown error', error_count: brokerConnectionErrors },
        'connectFailed'
      );

      if (brokerConnectionErrors >= BROKER_MAX_CONNECTION_ERRORS) {
        if (!isFunctionReturned) {
          reject(new Error(`Failed to connect after ${brokerConnectionErrors} tries`));
          isFunctionReturned = true;
          void connection.close();
        } else {
          process.exit(10);
        }
      }
    });

    connection.on('disconnect', err => {
      logger.warn({ error_message: err.err?.message || 'Unknown error' }, 'disconnect');
    });

    async function onExit(signal: string) {
      logger.debug(`onExit(${signal}) -> closing broker connection`);
      await connection.close();
      logger.debug(`onExit(${signal}) -> closed broker connection`);
      process.kill(process.pid, signal);
    }

    process.once('SIGTERM', async () => {
      return onExit('SIGTERM');
    });

    process.once('SIGINT', async () => {
      return onExit('SIGINT');
    });
  });
}

export class RabbitBroker {
  static connectToBroker(): Promise<AmqpConnectionManager> {
    checkBrokerEnv();

    const logger = getLogger();
    return new Promise(resolve => {
      const checkBrokerLoop = (retries = 1) => {
        let connected = false;

        getBrokerConnection()
          .then(conn => {
            logger.info('Broker connected');
            connected = true;

            process.once('SIGINT', async () => {
              logger.info('Shutting down broker');
              try {
                await conn.close();
                logger.info('Broker disconnected');
              } catch (e) {
                logger.error(e);
              }
              logger.info('halt');
              process.kill(process.pid, 'SIGINT');
            });
            resolve(conn);
          })
          .catch(e => {
            if (!connected) {
              logger.error(`#${retries} failed to connect to the broker: ${e.message}`);
              const to = Math.min(retries * retries, 30);
              logger.error(`#${retries} retry in: ${to}s`);

              if (retries >= 10) {
                logger.error('Giving it up, too many failures');
                process.exit(1);
              }

              setTimeout(() => {
                checkBrokerLoop(retries + 1);
              }, to * 1000);
            } else {
              logger.error(`App failed: ${e.message}`);
            }
          });
      };

      checkBrokerLoop();
    });
  }
}
