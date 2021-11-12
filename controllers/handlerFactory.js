const asyncCatch = require('../libs/asyncCatch');
const AppError = require('../libs/AppError');
const APIFeatures = require('../libs/apiFeatures');
const paginate = require('../libs/paginate');
//One document

exports.createOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    const doc = await Model.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getOne = (Model, options = {}) =>
  asyncCatch(async (req, res, next) => {
    const queryFeatures = new APIFeatures(
      Model.findById(req.params.id),
      req.query
    ).limit();

    if (options.populate) {
      queryFeatures.query.populate(options.populate);
    }
    const doc = await queryFeatures.query;

    //handle no document
    if (!doc) {
      return next(new AppError('Resource not found.', 404));
    }

    //call authorization function if specified
    if (typeof options.authorize === 'function') {
      if (!options.authorize(req, doc)) {
        const resourceName = Model.collection.name;
        return next(
          new AppError(
            `You are not authorized to view this ${resourceName.slice(
              0,
              resourceName.length - 1
            )}.`,
            403
          )
        );
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.updateOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    //possibly move
    if (req.file) req.body.photo = req.file.filename;
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
      context: 'query',
    });

    if (!doc) {
      return next(new AppError('Resource not found.', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.deleteOne = (Model) =>
  asyncCatch(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) {
      return next(new AppError('Resource not found.', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null,
    });
  });

//All documents
exports.getAll = (Model, populateOptions) =>
  asyncCatch(async (req, res, next) => {
    const queryFeatures = new APIFeatures(Model.find(), req.query)
      .filter()
      .sort()
      .loc()
      .search();

    //population
    if (populateOptions) {
      queryFeatures.query.populate(populateOptions);
    }

    //pagination
    let data = [];
    let total;
    let page;
    let pages;
    if (req.query.paginate) {
      const response = await paginate(
        Model,
        queryFeatures.query,
        queryFeatures.queryString
      );

      data = response.docs;
      ({ total, page, pages } = response);
    } else {
      queryFeatures.limit();
      data = await queryFeatures.query;
    }

    res.status(200).json({
      status: 'success',
      results: data.length,
      data: {
        data,
        total,
        page,
        pages,
      },
    });
  });
