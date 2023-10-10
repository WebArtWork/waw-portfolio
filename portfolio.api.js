const path = require("path");
const template = path.join(process.cwd(), "template");

module.exports = async (waw) => {
	waw.crud("portfolio", {
		get: [
			{
				ensure: waw.next,
			},
			{
				name: "public",
				ensure: waw.next,
				query: () => {
					return {};
				},
			},
		],
		update: {
			query: (req) => {
				if (req.user.is.admin) {
					return {
						_id: req.body._id,
					};
				} else {
					return {
						moderators: req.user._id,
						_id: req.body._id,
					};
				}
			},
		},
		delete: {
			query: (req) => {
				if (req.user.is.admin) {
					return {
						_id: req.body._id,
					};
				} else {
					return {
						moderators: req.user._id,
						_id: req.body._id,
					};
				}
			},
		},
		create: {
			ensure: async (req, res, next) => {
				if (req.body.name) {
					req.body.url = req.body.name
						.toLowerCase()
						.replace(/[^a-z0-9]/g, "");
				}
				while (await waw.Portfolio.count({ url: req.body.url })) {
					const url = req.body.url.split("_");
					req.body.url =
						url[0] +
						"_" +
						(url.length > 1 ? Number(url[1]) + 1 : 1);
				}
				next();
				}
		}
	});

	waw.build(template, "portfolios");
	waw.build(template, "portfolio");
	waw.serve_portfolios = {};
	waw.serve_portfolio = {};
	const portfolios = async (req, res) => {
		if (typeof waw.serve_portfolios[req.get("host")] === "function") {
			waw.serve_portfolios[req.get("host")](req, res);
		} else {
			const portfolios = await waw.portfolios(
				req.params.tag_id ? { tag: req.params.tag_id } : {}
			);

			res.send(
				waw.render(
					path.join(template, "dist", "portfolios.html"),
					{
						...waw.config,
						title: waw.config.portfolioTitle || waw.config.title,
						description:
							waw.config.portfolioDescription ||
							waw.config.description,
						image: waw.config.portfolioImage || waw.config.image,
						portfolios,
						categories: await waw.tag_groups("portfolio"),
					},
					waw.translate(req)
				)
			);
		}
	};
	waw.app.get("/portfolios", portfolios);
	waw.app.get("/portfolios/:tag_id", portfolios);
	waw.app.get("/portfolio/:_id", async (req, res) => {
		if (typeof waw.serve_portfolio[req.get("host")] === "function") {
			waw.serve_portfolio[req.get("host")](req, res);
		} else {
			const portfolio = await waw.Portflio.findOne(
			waw.mongoose.Types.ObjectId.isValid(req.params._id)
				? { _id: req.params._id }
				: { url: req.params._id }
			);

			res.send(
				waw.render(
					path.join(template, "dist", "portfolio.html"),
					{
						...waw.config,
						portfolio
					},
					waw.translate(req)
				)
			);
		}
	});

	waw.portfolios = async (query = {}, limit, count = false) => {
		let exe = count
			? waw.Portfolio.countDocuments(query)
			: waw.Portfolio.find(query);
		if (limit) {
			exe = exe.limit(limit);
		}
		return await exe;
	};

	waw.portfolio = async (query) => {
		return await waw.Portfolio.findOne(query);
	};

	const save_file = (doc) => {
		if (doc.thumb) {
			waw.save_file(doc.thumb);
		}

		if (doc.thumbs) {
			for (const thumb of doc.thumbs) {
				waw.save_file(thumb);
			}
		}
	};

	waw.on("portfolio_create", save_file);
	waw.on("portfolio_update", save_file);
	waw.on("portfolio_delete", (doc) => {
		if (doc.thumb) {
			waw.delete_file(doc.thumb);
		}

		if (doc.thumbs) {
			for (const thumb of doc.thumbs) {
				waw.delete_file(thumb);
			}
		}
	});
	await waw.wait(2000);
	if (waw.store_landing) {
		waw.store_landing.portfolios = async (query) => {
			return await waw.portfolios(query, 4);
		};
	}
};
