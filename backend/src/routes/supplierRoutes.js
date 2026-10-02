const express = require('express');
const controller = require('../controllers/supplierController');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/supplierValidator');

const router = express.Router();
router.get('/', validateQuery(schemas.listQuery), controller.list);
router.get('/:id', validateParams(schemas.idParams), controller.get);

module.exports = router;
