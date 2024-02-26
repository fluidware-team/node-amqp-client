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
import * as tls from 'tls';
import * as fs from 'fs';
import * as os from 'os';
import { AmqpConfig } from './interface';

const memoizedOptions: { [prefix: string]: AmqpConfig } = {};

function getSSLConfig(prefix: string) {
  const FW_AMPQ_USE_SSL = EnvParse.envBool(`FW_AMPQ_${prefix}USE_SSL`, false);
  const FW_AMPQ_SSL_REJECT_UNAUTHORIZED = EnvParse.envBool(`FW_AMPQ_${prefix}SSL_REJECT_UNAUTHORIZED`, true);
  const FW_AMPQ_SSL_CA_PATH = EnvParse.envString(`FW_AMPQ_${prefix}SSL_CA_PATH`, '');
  const FW_AMPQ_SSL_KEY_PEM_PATH = EnvParse.envString(`FW_AMPQ_${prefix}SSL_KEY_PEM_PATH`, '');
  const FW_AMPQ_SSL_KEY_PASSPHRASE = EnvParse.envStringOptional(`FW_AMPQ_${prefix}SSL_KEY_PASSPHRASE`);
  const FW_AMPQ_SSL_CERT_PEM_PATH = EnvParse.envString(`FW_AMPQ_${prefix}SSL_CERT_PEM_PATH`, '');

  let sslConfig: boolean | tls.ConnectionOptions | undefined = undefined;
  if (FW_AMPQ_USE_SSL) {
    if (!FW_AMPQ_SSL_REJECT_UNAUTHORIZED) {
      sslConfig = {
        rejectUnauthorized: false
      };
    } else {
      if (FW_AMPQ_SSL_CA_PATH && FW_AMPQ_SSL_CERT_PEM_PATH && FW_AMPQ_SSL_KEY_PEM_PATH) {
        sslConfig = {
          ca: [fs.readFileSync(FW_AMPQ_SSL_CA_PATH, 'utf-8')],
          key: fs.readFileSync(FW_AMPQ_SSL_KEY_PEM_PATH, 'utf-8'),
          cert: fs.readFileSync(FW_AMPQ_SSL_CERT_PEM_PATH, 'utf-8'),
          passphrase: FW_AMPQ_SSL_KEY_PASSPHRASE
        };
      } else {
        sslConfig = true;
      }
    }
  }
  return sslConfig;
}

export function getAmqpConfig(instancePrefix?: string) {
  const prefixKey = instancePrefix ?? '_default_';
  const prefix = instancePrefix ? `${instancePrefix.toUpperCase()}_` : '';
  if (!memoizedOptions[prefixKey]) {
    // FW_AMPQ_${prefix}BROKERS: "prefix" is not required, can be used to have multiple amqp configurations: i.e: FW_AMPQ_INSTANCE_A_BROKERS=rabbitmq-a-01:5672,rabbitmq-a-02:5672, FW_AMPQ_INSTANCE_B_BROKERS=rabbitmq-b-01:5672,rabbitmq-a-02:5672
    const FW_AMPQ_BROKERS = EnvParse.envStringList(`FW_AMPQ_${prefix}BROKERS`, ['localhost:5672']);
    // FW_AMPQ_${prefix}CLIENT_ID: default to `hostname()`
    const FW_AMPQ_CLIENT_ID = EnvParse.envString(`FW_AMPQ_${prefix}CLIENT_ID`, os.hostname());
    memoizedOptions[prefixKey] = {
      clientId: FW_AMPQ_CLIENT_ID,
      brokers: FW_AMPQ_BROKERS.map(s => s.trim()).filter((s: string) => !!s),
      ssl: getSSLConfig(prefix)
    };
  }
  return memoizedOptions[prefixKey];
}
