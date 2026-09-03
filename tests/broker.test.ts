import { describe, before, after, beforeEach, afterEach, it } from 'mocha';
import assert from 'assert';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { RabbitBroker } from '../src/broker';
import { buildBrokerURIs } from '../src/config';
import { VmRabbitMQContainer } from './testcontainers/rabbitmq-container';
import type { WrapperStartedRabbitMQContainer } from './testcontainers/wrapper-started-rabbitmq-container';

// connectToBroker registers process.once('SIGINT'/'SIGTERM') on every attempt; raise the cap.
process.setMaxListeners(50);

const RABBIT_ENV_KEYS = [
  'FW_RABBITMQ_USER',
  'FW_RABBITMQ_PASSWORD',
  'FW_RABBITMQ_PASSWORD_FILE',
  'FW_RABBITMQ_PROTOCOL',
  'FW_RABBITMQ_PORT',
  'FW_RABBITMQ_HOST',
  'FW_RABBITMQ_VHOST',
  'FW_RABBITMQ_HOSTS',
  'FW_RABBITMQ_CONNECTION_NAME'
];

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of RABBIT_ENV_KEYS) {
    snap[key] = process.env[key];
  }
  return snap;
}

function clearEnv() {
  for (const key of RABBIT_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreEnv(snap: EnvSnapshot) {
  for (const key of RABBIT_ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('buildBrokerURIs', function () {
  let envSnapshot: EnvSnapshot;

  beforeEach(function () {
    envSnapshot = snapshotEnv();
    clearEnv();
  });

  afterEach(function () {
    restoreEnv(envSnapshot);
  });

  it('throws if FW_RABBITMQ_USER is not set', function () {
    assert.throws(() => buildBrokerURIs(), /Required env FW_RABBITMQ_USER is missing/);
  });

  it('throws if neither FW_RABBITMQ_PASSWORD nor FW_RABBITMQ_PASSWORD_FILE is set', function () {
    process.env.FW_RABBITMQ_USER = 'guest';
    assert.throws(() => buildBrokerURIs(), /FW_RABBITMQ_PASSWORD or FW_RABBITMQ_PASSWORD_FILE env is required/);
  });

  it('returns the default brokerURI', function () {
    process.env.FW_RABBITMQ_USER = 'guest';
    process.env.FW_RABBITMQ_PASSWORD = 'guestpwd';
    assert.deepStrictEqual(buildBrokerURIs(), ['amqp://guest:guestpwd@127.0.0.1:5672/']);
  });

  it('returns the brokerURI with custom host, port and vhost', function () {
    process.env.FW_RABBITMQ_USER = 'guest';
    process.env.FW_RABBITMQ_PASSWORD = 'guestpwd';
    process.env.FW_RABBITMQ_HOST = 'broker';
    process.env.FW_RABBITMQ_PORT = '12345';
    process.env.FW_RABBITMQ_VHOST = 'vhostname';
    assert.deepStrictEqual(buildBrokerURIs(), ['amqp://guest:guestpwd@broker:12345/vhostname']);
  });

  it('reads the password from FW_RABBITMQ_PASSWORD_FILE', function () {
    process.env.FW_RABBITMQ_USER = 'guest';
    process.env.FW_RABBITMQ_PASSWORD_FILE = 'tests/mocks/file_password.txt';
    assert.deepStrictEqual(buildBrokerURIs(), ['amqp://guest:secretPassword@127.0.0.1:5672/']);
  });
});

for (const rabbitImage of ['rabbitmq:3.11-management-alpine', 'rabbitmq:4.3-management-alpine']) {
  describe(`RabbitBroker.connectToBroker (integration) with image ${rabbitImage}`, function () {
    this.timeout(240_000);

    let envSnapshot: EnvSnapshot;
    let wrapper: WrapperStartedRabbitMQContainer;
    let connection: AmqpConnectionManager | undefined;

    before(async function () {
      envSnapshot = snapshotEnv();
      clearEnv();

      wrapper = await new VmRabbitMQContainer(undefined, undefined, undefined, undefined, rabbitImage).startVmBroker();

      process.env.FW_RABBITMQ_USER = VmRabbitMQContainer.DEFAULT_USER;
      process.env.FW_RABBITMQ_PASSWORD = VmRabbitMQContainer.DEFAULT_PASSWORD;
      process.env.FW_RABBITMQ_VHOST = VmRabbitMQContainer.DEFAULT_VHOST;
      process.env.FW_RABBITMQ_HOST = wrapper.vmBroker.getHost();
      process.env.FW_RABBITMQ_PORT = String(wrapper.vmBroker.getMappedPort(VmRabbitMQContainer.RABBITMQ_AMQP_PORT));
    });

    after(async function () {
      if (connection) {
        await connection.close();
      }
      if (wrapper) {
        await wrapper.stopBroker();
      }
      restoreEnv(envSnapshot);
    });

    it('connects to a real broker', async function () {
      connection = await RabbitBroker.connectToBroker();
      assert.strictEqual(connection.isConnected(), true);
    });
  });
}

type EmitFn = (event: string, arg?: unknown) => void;

interface FakeConnection {
  isConnected(): boolean;
  on(event: string, cb: (arg: unknown) => void): FakeConnection;
  close(): Promise<void>;
}

// Broker compiles to `amqp_connection_manager_1.connect(...)`, so patching the required module works.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const amqpConnectionManager = require('amqp-connection-manager');

describe('RabbitBroker.connectToBroker (mocked)', function () {
  this.timeout(5_000);

  let envSnapshot: EnvSnapshot;
  let originalConnect: unknown;
  let originalExit: typeof process.exit;
  let capturedUrls: string[];
  let connectCallCount: number;
  let capturedExitCode: number | undefined;
  let signalListenersBefore: { SIGINT: NodeJS.SignalsListener[]; SIGTERM: NodeJS.SignalsListener[] };

  // Each mock call runs `script(emit, callNumber)` on the next tick, after broker registered handlers.
  function installFakeConnect(script: (emit: EmitFn, callNumber: number) => void) {
    amqpConnectionManager.connect = (urls: string[]) => {
      capturedUrls = urls;
      connectCallCount++;
      const currentCall = connectCallCount;
      const handlers: Record<string, (arg: unknown) => void> = {};
      const conn: FakeConnection = {
        isConnected: () => true,
        on: (event, cb) => {
          handlers[event] = cb;
          return conn;
        },
        close: () => Promise.resolve()
      };
      setImmediate(() =>
        script((event, arg) => {
          const handler = handlers[event];
          if (handler) {
            handler(arg);
          }
        }, currentCall)
      );
      return conn;
    };
  }

  beforeEach(function () {
    envSnapshot = snapshotEnv();
    clearEnv();
    process.env.FW_RABBITMQ_USER = 'guest';
    process.env.FW_RABBITMQ_PASSWORD = 'guestpwd';
    process.env.FW_RABBITMQ_HOST = 'broker';

    capturedUrls = [];
    connectCallCount = 0;
    capturedExitCode = undefined;

    signalListenersBefore = {
      SIGINT: process.listeners('SIGINT'),
      SIGTERM: process.listeners('SIGTERM')
    };

    originalConnect = amqpConnectionManager.connect;
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      capturedExitCode = code;
    }) as typeof process.exit;
  });

  afterEach(function () {
    amqpConnectionManager.connect = originalConnect;
    process.exit = originalExit;
    restoreEnv(envSnapshot);
    // Drop the once('SIGINT'/'SIGTERM') listeners connectToBroker added during the test.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      for (const listener of process.listeners(signal)) {
        if (!signalListenersBefore[signal].includes(listener)) {
          process.removeListener(signal, listener);
        }
      }
    }
  });

  it('resolves on connect and passes the correct brokerURI', async function () {
    installFakeConnect(emit => {
      emit('connect', {});
    });
    const connection = await RabbitBroker.connectToBroker();
    assert.strictEqual(connection.isConnected(), true);
    assert.deepStrictEqual(capturedUrls, ['amqp://guest:guestpwd@broker:5672/']);
  });

  it('retries after connectFailed and resolves on a later attempt', async function () {
    installFakeConnect((emit, callNumber) => {
      if (callNumber === 1) {
        for (let i = 0; i < 4; i++) {
          emit('connectFailed', { err: new Error('test error') });
        }
      } else {
        emit('connect', {});
      }
    });
    const connection = await RabbitBroker.connectToBroker();
    assert.strictEqual(connection.isConnected(), true);
    assert.strictEqual(connectCallCount, 2);
  });

  it('stays connected when a disconnect event is emitted', async function () {
    installFakeConnect(emit => {
      emit('connect', {});
      setTimeout(() => emit('disconnect', { err: new Error('test error') }), 10);
    });
    const connection = await RabbitBroker.connectToBroker();
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.strictEqual(connection.isConnected(), true);
    assert.strictEqual(capturedExitCode, undefined);
  });

  it('calls process.exit(10) on connectFailed after being connected', async function () {
    installFakeConnect(emit => {
      emit('connect', {});
      for (let i = 0; i < 4; i++) {
        emit('connectFailed', { err: new Error('test error') });
      }
    });
    await RabbitBroker.connectToBroker();
    assert.strictEqual(capturedExitCode, 10);
  });
});
