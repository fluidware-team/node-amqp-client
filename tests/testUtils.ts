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

import * as childProcess from 'child_process';

export const rabbitmq_user = 'fwtestuser';
export const rabbitmq_password = 'fwtestpwd';

const dockerRunCmds = {
  single: {
    up: [
      `docker run --rm -d -e RABBITMQ_DEFAULT_USER=${rabbitmq_user} -e RABBITMQ_DEFAULT_PASS=${rabbitmq_password} --hostname fw-amqp-test-01 --name fw-amqp-test-01 -p 127.0.0.1:5672:5672 -p 127.0.0.1:15672:15672 rabbitmq:3.8-management`
    ],
    down: ['docker stop fw-amqp-test-01']
  },
  cluster: {
    // TODO: Add cluster setup
    up: [],
    down: []
  }
};

export function startDocker(mode: keyof typeof dockerRunCmds) {
  const tasks = dockerRunCmds[mode].up.map(run);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (task && task.code !== 0) {
      console.error('Failed to start container!');
      console.error(task.output);
      return false;
    }
  }
  return true;
}

export function cleanUpDocker(mode: keyof typeof dockerRunCmds) {
  dockerRunCmds[mode].down.map(run);
}

function run(cmd: string) {
  try {
    const proc = childProcess.spawnSync(cmd, {
      shell: true
    });
    const output = Buffer.concat(proc.output.filter(c => c) as Buffer[]).toString('utf8');
    if (proc.status !== 0) {
      console.error('Failed run command:', cmd);
      console.error(output);
    }
    return {
      code: proc.status,
      output
    };
  } catch (e) {
    console.log(e);
    return;
  }
}
