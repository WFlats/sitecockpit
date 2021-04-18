sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.CreateUoM", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				UoMID: "",
				UoMPath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createUoMView");
			this.getRouter().getTargets().getTarget("CreateUoM").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("UoMs", {
					ID: sObjectId
				});
			this.getModel("createUoMView").setProperty("/mode", sMode);
			this.getModel("createUoMView").setProperty("/UoMID", sObjectId);
			this.getModel("createUoMView").setProperty("/UoMPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createUoMView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editUoMViewTitle"));
				this.getView().bindElement({
					path: sObjectPath,
					events: {
						dataRequested: function () {
							oViewModel.setProperty("/busy", true);
						},
						dataReceived: function () {
							oViewModel.setProperty("/busy", false);
						}
					}
				});
			} else { // create
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createUoMViewTitle"));
				var oContext = oModel.createEntry("UoMs");
				this.getView().setBindingContext(oContext);
				// clear values
				this.byId("code").setValue("");
				this.byId("description").setValue("");
				this.byId("dimension").setSelectedKey();
				this.byId("imperial").setSelected();
				this.byId("baseUnit").setSelectedKey();
				this.byId("factor").setValue("");
				this.byId("factorLabel").setRequired(false);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sDimension = this.byId("dimension").getSelectedKey(),
				bImperial = this.byId("imperial").getSelected(),
				sBaseUnit = this.byId("baseUnit").getSelectedKey(),
				mFactor = parseFloat(this.byId("factor").getValue()).toFixed(5),
				bSaveEnabled = false;
			mFactor = isNaN(mFactor) ? null : mFactor;
			if (sBaseUnit) {
				this.byId("factorLabel").setRequired(true);
			}
			if (this.getModel("createUoMView").getProperty("/mode") === "Create") {
				if (sCode && sDescription && sDimension) {
					if (sBaseUnit && mFactor) {
						bSaveEnabled = true;
					}
				}
			} else { //Edit
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sCode !== "" && sDescription !== "" && sDimension !== "") {
					if (sCode !== oData.code || sDescription !== oData.description || sDimension !== String(oData.dimension) ||
						bImperial !== oData.imperial || mFactor !== oData.conversionFactor || sBaseUnit !== oData.baseUnit) {
						if (sBaseUnit && mFactor) {
							bSaveEnabled = true;
						}
					}
				}
			}
			this.getModel("createUoMView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sDimension = this.byId("dimension").getSelectedKey(),
				bImperial = this.byId("imperial").getSelected(),
				sBaseUnitID = this.byId("baseUnit").getSelectedKey(),
				mFactor = parseFloat(this.byId("factor").getValue()).toFixed(5),
				bUpdated = true,
				that = this;

			this._isCodeUnique(sCode).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createUoMView").getProperty("/mode") === "Edit" && sCode === oModel.getProperty("code", oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("CodeUnitNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
						}
					);
				} else {
					bUpdated = oModel.setProperty("code", sCode, oBC) && bUpdated;
					bUpdated = oModel.setProperty("description", sDescription, oBC) && bUpdated;
					bUpdated = oModel.setProperty("dimension", Number(sDimension), oBC) && bUpdated;
					bUpdated = oModel.setProperty("imperial", bImperial, oBC) && bUpdated;
					bUpdated = oModel.setProperty("baseUnit_ID", sBaseUnitID, oBC) && bUpdated;
					mFactor = isNaN(mFactor) ? null : mFactor;
					bUpdated = oModel.setProperty("conversionFactor", mFactor, oBC) && bUpdated;
					if (!bUpdated) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						oModel.resetChanges();
						return;
					}
					if (that.getModel("createUoMView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("UoMDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("UoMDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			if (this.getModel("createUoMView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getModel("createUoMView").setProperty("/enableSave", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("UoMs");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/UoMs",
				aFilter = [new Filter({
					path: "code",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		}

	});

});