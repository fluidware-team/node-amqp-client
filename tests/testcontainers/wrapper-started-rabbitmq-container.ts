import { StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { StartedNetwork } from 'testcontainers';
import { Channel } from 'amqp-connection-manager';
import amqp from 'amqplib';
import { VmRabbitMQContainer } from './rabbitmq-container';

export class WrapperStartedRabbitMQContainer {
  private connectionBroker?: amqp.Connection;
  public channel?: Channel;

  constructor(
    public vmBroker: StartedRabbitMQContainer,
    private user: string,
    private password: string,
    private vhost: string,
    private network: StartedNetwork
  ) {}

  async createAndConnectToChannel(queueName: string) {
    if (!this.connectionBroker) this.connectionBroker = await amqp.connect(this.getAmqpUrl());

    this.channel = await this.connectionBroker.createChannel();
    await this.channel.assertQueue(queueName, { durable: true });
    return this.channel;
  }

  getAmqpUrl(): string {
    const host = this.vmBroker.getHost();
    const port = this.vmBroker.getMappedPort(VmRabbitMQContainer.RABBITMQ_AMQP_PORT);
    return `amqp://${this.user}:${this.password}@${host}:${port}/${this.vhost}`;
  }

  async closeChannel() {
    if (this.channel) {
      await this.channel.close();
      this.channel = undefined;
    }
  }

  async closeConnection() {
    if (this.connectionBroker) {
      await this.connectionBroker.close();
      this.connectionBroker = undefined;
    }
  }

  async stopBroker() {
    await this.closeChannel();
    await this.closeConnection();
    await this.vmBroker.stop();
    await this.network.stop();
  }
}
