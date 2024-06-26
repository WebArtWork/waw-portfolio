const path = require("path");
const template = path.join(process.cwd(), "template");

module.exports = async (waw) => {
	waw.crud("portfolio", {
		get: [
			{
				name: "public",
				ensure: waw.next,
				query: () => {
					return {};
				},
			}
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
				if (!req.body.url) {
					req.body.url = null;
				} else {
					while (await waw.Portfolio.count({ url: req.body.url })) {
						const url = req.body.url.split("_");
						req.body.url =
							url[0] +
							"_" +
							(url.length > 1 ? Number(url[1]) + 1 : 1);
					}
				}
				next();
			},
			ensureDomain: async (req, res, next) => {
				req.body.domain = req.get('host');
				next();
			}
		}
	});


	const reloads = {};
	waw.addJson(
		"storePreparePortfolios",
		async (store, fillJson, req) => {
			reloads[store._id] = reloads[store._id] || [];
			const fillAllPortfolios = async () => {
				fillJson.allPortfolios = await waw.Portfolio.find({
					tags: {
						$in: fillJson.tagsIds,
					},
				}).lean();
				for (const portfolio of fillJson.allPortfolios) {
					portfolio.id = portfolio._id.toString();
					portfolio._id = portfolio._id.toString();
					portfolio.tags = (portfolio.tags||[]).map(t => t.toString());
				}
				fillJson.top_portfolios = fillJson.allPortfolios.filter((p) => {
					return p.top;
				});
			};
			fillAllPortfolios();
			reloads[store._id].push(fillAllPortfolios);
		},
		"Prepare updatable documents of portfolios"
	);
	const tagsUpdate = async (tag) => {
		setTimeout(() => {
			for (const storeId of (tag.stores || [])) {
				for (const reload of (reloads[storeId] || [])) {
					reload();
				}
			}
		}, 2000);
	};
	waw.on("tag_create", tagsUpdate);
	waw.on("tag_update", tagsUpdate);
	waw.on("tag_delete", tagsUpdate);
	const portfoliosUpdate = async (portfolio) => {
		const tags = await waw.Tag.find({
			_id: portfolio.tags,
		});
		for (const tag of tags) {
			tagsUpdate(tag);
		}
	};
	waw.on("portfolio_create", portfoliosUpdate);
	waw.on("portfolio_update", portfoliosUpdate);
	waw.on("portfolio_delete", portfoliosUpdate);

	waw.servePortfolios = async (req, res) => {
		const query = {};
		if (req.params.tag_id) {
			query.tag = req.params.tag_id;
		}
		if (req.get('host') !== waw.config.land) {
			query.domain = req.get('host');
		}

		const portfolios = await waw.Portfolio.find(query).limit(10);;

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
	};

	// waw.api({
	// 	domain: waw.config.land,
	// 	template: {
	// 		path: template,
	// 		prefix: "/template",
	// 		pages: "portfolio portfolios",
	// 	},
	// 	page: {
	// 		"/portfolios": waw.servePortfolios,
	// 		"/portfolios/:tag_id": waw.servePortfolios,
	// 		"/portfolio/:_id": waw.servePortfolio
	// 	}
	// });
	waw.servePortfolio = async (req, res) => {
		const portfolio = await waw.Portfolio.findOne(
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

	waw.operatorPortfolios = async (operator, fillJson) => {
		fillJson.portfolios = await waw.portfolios({
			domain: operator.domain
		});

		fillJson.portfoliosByTag = [];
		for (const portfolio of fillJson.portfolios) {
			if (!portfolio.tag) continue;
			const tagObj = fillJson.portfoliosByTag.find(c => c.id.toString() === portfolio.tag.toString());
			if (tagObj) {
				tagObj.portfolios.push(portfolio);
			} else {
				const tag = waw.getTag(portfolio.tag);

				fillJson.portfoliosByTag.push({
					id: portfolio.tag,
					category: tag.category,
					name: tag.name,
					description: tag.description,
					portfolios: [portfolio]
				})
			}
		}

		fillJson.portfoliosByCategory = [];
		for (const byTag of fillJson.portfoliosByTag) {
			const categoryObj = fillJson.portfoliosByCategory.find(c => c.id.toString() === byTag.category.toString());
			if (categoryObj) {
				categoryObj.tags.push(byTag);

				for (const portfolio of byTag.portfolios) {
					if (!categoryObj.portfolios.find(s => s.id === portfolio.id)) {
						categoryObj.portfolios.push(portfolio)
					}
				}
			} else {
				const category = waw.getCategory(byTag.category);
				if (category) {
					fillJson.portfoliosByCategory.push({
						id: byTag.category,
						name: category.name,
						description: category.description,
						portfolios: byTag.portfolios.slice(),
						tags: [byTag]
					})
				}
			}
		}
	}

	waw.operatorPortfolio = async (operator, fillJson, req) => {
		fillJson.portfolio = await waw.portfolio({
			domain: operator.domain,
			_id: req.params._id
		});

		fillJson.footer.portfolio = fillJson.portfolio;
	}

	waw.operatorTopPortfolios = async (operator, fillJson) => {
		fillJson.topPortfolios = await waw.portfolios({
			domain: operator.domain
		}, 4);

		fillJson.footer.topPortfolios = fillJson.topPortfolios;
	}

	waw.storePortfolios = async (store, fillJson) => {
		fillJson.portfolios = await waw.portfolios({
			author: store.author
		});

		fillJson.portfoliosByTag = [];
		for (const portfolio of fillJson.portfolios) {
			if (!portfolio.tag) continue;
			const tagObj = fillJson.portfoliosByTag.find(c => c.id.toString() === portfolio.tag.toString());
			if (tagObj) {
				tagObj.portfolios.push(portfolio);
			} else {
				const tag = waw.getTag(portfolio.tag);
				if (tag) {
					fillJson.portfoliosByTag.push({
						id: portfolio.tag,
						category: tag.category,
						name: tag.name,
						description: tag.description,
						portfolios: [portfolio]
					})
				}
			}
		}

		fillJson.portfoliosByCategory = [];
		for (const byTag of fillJson.portfoliosByTag) {
			const categoryObj = fillJson.portfoliosByCategory.find(c => c.id.toString() === byTag.category.toString());
			if (categoryObj) {
				categoryObj.tags.push(byTag);

				for (const portfolio of byTag.portfolios) {
					if (!categoryObj.portfolios.find(s => s.id === portfolio.id)) {
						categoryObj.portfolios.push(portfolio)
					}
				}
			} else {
				const category = waw.getCategory(byTag.category)
				if (category) {
					fillJson.portfoliosByCategory.push({
						id: byTag.category,
						name: category.name,
						description: category.description,
						portfolios: byTag.portfolios.slice(),
						tags: [byTag]
					})
				}
			}
		}
	}

	waw.storePortfolio = async (store, fillJson, req) => {
		fillJson.portfolio = await waw.portfolio({
			author: store.author,
			_id: req.params._id
		});

		fillJson.footer.portfolio = fillJson.portfolio;
	}

	waw.storeTopPortfolios = async (store, fillJson) => {
		fillJson.topPortfolios = await waw.portfolios({
			author: store.author,
		}, 4);

		fillJson.footer.topPortfolios = fillJson.topPortfolios;
	}

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
