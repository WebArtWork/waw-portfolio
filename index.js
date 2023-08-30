const path = require('path');
const template = path.join(process.cwd(), 'template');

module.exports = async waw => {
	const seo = {
		title: waw.config.name,
		description: waw.config.description,
		image: 'https://body.webart.work/template/img/logo.png'
	};

	waw.build(template, 'portfolios');
	waw.build(template, 'portfolio');
	waw.serve_portfolios = {};
	waw.serve_portfolio = {};
	const portfolios = async (req, res) => {
		if (typeof waw.serve_portfolios[req.get("host")] === "function") {
			waw.serve_portfolios[req.get("host")](req, res);
		} else {
			const portfolios = await waw.portfolios(
				req.params.tag_id ?
					{ tag: req.params.tag_id } :
					{}
			);

			res.send(
				waw.render(
					path.join(template, 'dist', 'portfolios.html'),
					{
						...seo,
						description: waw.config.portfolioDescription,
						portfolios,
						categories: await waw.tag_groups('portfolios')
					},
					waw.translate(req)
				)
			)
		}
	};
	waw.app.get('/portfolios', portfolios);
	waw.app.get('/portfolios/:tag_id', portfolios);
	waw.app.get('/portfolio/:_id', async (req, res) => {
		if (typeof waw.serve_portfolios[req.get("host")] === "function") {
			waw.serve_portfolios[req.get("host")](req, res);
		} else {
			const portfolio = await waw.portfolio({
				_id: {
					$ne: req.params._id
				}
			}).limit(6);

			res.send(
				waw.render(
					path.join(template, 'dist', 'portfolio.html'),
					{
						...seo,
						portfolio,
						categories: await waw.tag_groups('portfolios'),
					},
					waw.translate(req)
				)
			)
		}
	});

	waw.portfolios = async (query, limit) => {
		if (limit) {
			return await waw.Portfolio.find(query).limit(limit);
		} else {
			return await waw.Portfolio.find(query);
		}
	}

	waw.portfolio = async (query) => {
		return await waw.Portfolio.findOne(query);
	}

	const save_file = (doc) => {
		if (doc.thumb) {
			waw.save_file(doc.thumb);
		}

		if (doc.thumbs) {
			for (const thumb of doc.thumbs) {
				waw.save_file(thumb);
			}
		}
	}

	waw.on('portfolio_create', save_file);
	waw.on('portfolio_update', save_file);
	waw.on('portfolio_delete', (doc) => {
		if (doc.thumb) {
			waw.delete_file(doc.thumb);
		}

		if (doc.thumbs) {
			for (const thumb of doc.thumbs) {
				waw.delete_file(thumb);
			}
		}
	});
};
