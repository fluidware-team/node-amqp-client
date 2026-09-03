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

import { EnvParse } from '@fluidware-it/saddlebag';
import fs from 'fs';

function getRabbitPassword(RABBITMQ_PASSWORD_FILE: string, RABBITMQ_PASSWORD: string): string {
  if (RABBITMQ_PASSWORD_FILE) {
    return fs.readFileSync(RABBITMQ_PASSWORD_FILE, 'utf8');
  }
  return RABBITMQ_PASSWORD;
}

export function buildBrokerURIs(): string[] {
  const RABBITMQ_USER = EnvParse.envStringRequired('FW_RABBITMQ_USER');
  const RABBITMQ_PASSWORD = EnvParse.envString('FW_RABBITMQ_PASSWORD', '');
  const RABBITMQ_PASSWORD_FILE = EnvParse.envString('FW_RABBITMQ_PASSWORD_FILE', '');

  if (!RABBITMQ_PASSWORD && !RABBITMQ_PASSWORD_FILE) {
    throw new Error('FW_RABBITMQ_PASSWORD or FW_RABBITMQ_PASSWORD_FILE env is required');
  }

  const RABBITMQ_PROTOCOL = EnvParse.envString('FW_RABBITMQ_PROTOCOL', 'amqp');
  const RABBITMQ_PORT = EnvParse.envInt('FW_RABBITMQ_PORT', 5672);
  const RABBITMQ_VHOST = EnvParse.envString('FW_RABBITMQ_VHOST', '');
  const RABBITMQ_HOST = EnvParse.envString('FW_RABBITMQ_HOST', '127.0.0.1');
  const RABBITMQ_HOSTS = EnvParse.envStringList('FW_RABBITMQ_HOSTS', []);

  const rabbitmqPassword = getRabbitPassword(RABBITMQ_PASSWORD_FILE, RABBITMQ_PASSWORD);

  function getBrokerURI(host: string, port?: string): string {
    return `${RABBITMQ_PROTOCOL}://${RABBITMQ_USER}:${rabbitmqPassword}@${host}:${
      port || RABBITMQ_PORT
    }/${RABBITMQ_VHOST}`;
  }

  const brokerURI: string[] = [];
  if (RABBITMQ_HOSTS.length > 0) {
    RABBITMQ_HOSTS.filter(host => !!host).forEach(host => {
      const [rabbitmqHost, port] = host.split(':');
      brokerURI.push(getBrokerURI(rabbitmqHost, port));
    });
    brokerURI.sort(() => Math.random() - 0.5);
  } else {
    brokerURI.push(getBrokerURI(RABBITMQ_HOST));
  }
  return brokerURI;
}

export function getConnectionName(): string | undefined {
  return EnvParse.envStringOptional('FW_RABBITMQ_CONNECTION_NAME') || EnvParse.envStringOptional('npm_package_name');
}
