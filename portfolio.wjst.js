import Crud from '/api/wjst/crud';
class Service extends Crud {
	getName = 'public';
	constructor() {
		super('/api/portfolio');
	}
}
export default new Service();
