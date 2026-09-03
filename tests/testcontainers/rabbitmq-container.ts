import { Network, StartedNetwork, Wait } from 'testcontainers';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { WrapperStartedRabbitMQContainer } from './wrapper-started-rabbitmq-container';

export class VmRabbitMQContainer extends RabbitMQContainer {
  static RABBITMQ_AMQP_PORT = 5672;
  static RABBITMQ_MANAGEMENT_PORT = 15672;
  static DEFAULT_USER = 'testuser';
  static DEFAULT_PASSWORD = 'testpwd';
  static DEFAULT_VHOST = 'testvhost';
  static DEFAULT_HOST = 'broker';

  private network!: StartedNetwork;

  constructor(
    public user: string = VmRabbitMQContainer.DEFAULT_USER,
    public password: string = VmRabbitMQContainer.DEFAULT_PASSWORD,
    public vhost: string = VmRabbitMQContainer.DEFAULT_VHOST,
    public host: string = VmRabbitMQContainer.DEFAULT_HOST,
    image = 'rabbitmq:4.3-management-alpine'
  ) {
    super(image);
  }

  public async startVmBroker(): Promise<WrapperStartedRabbitMQContainer> {
    this.network = await new Network().start();

    const broker = await super
      .withEnvironment({
        RABBITMQ_DEFAULT_USER: this.user,
        RABBITMQ_DEFAULT_PASS: this.password,
        RABBITMQ_DEFAULT_VHOST: this.vhost
      })
      .withExposedPorts(VmRabbitMQContainer.RABBITMQ_AMQP_PORT, VmRabbitMQContainer.RABBITMQ_MANAGEMENT_PORT)
      .withNetwork(this.network)
      .withNetworkAliases(this.host)
      .withWaitStrategy(Wait.forLogMessage('Server startup complete'))
      .start();

    return new WrapperStartedRabbitMQContainer(broker, this.user, this.password, this.vhost, this.network);
  }
}
