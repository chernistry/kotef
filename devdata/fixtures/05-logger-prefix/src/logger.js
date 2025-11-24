export class Logger {
  constructor(output = console) {
    this.output = output;
  }

  info(message) {
    // BUG: missing level prefix and timestamp
    this.output.log(message);
  }

  error(message) {
    // BUG: missing level prefix and timestamp
    this.output.error(message);
  }
}
